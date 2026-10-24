#!/usr/bin/env python3
"""Wikilyの公開ペットページを208件調査し、検証済みの入手元だけ更新する。

実行: pip install requests beautifulsoup4
      python tools/update_sources.py --workers 2 --throttle 1.0
失敗したペットは前回の情報を残す。取得不可を「入手先なし」とはみなさない。
"""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from urllib.parse import urlparse
import argparse
import csv
import json
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parent.parent
DB=ROOT/'pets.json'
BASES=('https://new.wikily.gg','https://wikily.gg')
HEADERS={'User-Agent':'Mozilla/5.0 (compatible; AION2PersonalPetChecker/4.0; noncommercial; contact: via GitHub repository)'}
LOCK=Lock()
LAST=[0.0]

def normalize(text):
    return re.sub(r'[\s\u3000・･–_\-]','',str(text)).lower()

def fetch(url,throttle=1.0):
    with LOCK:
        wait=max(0,throttle-(time.monotonic()-LAST[0]))
        if wait:time.sleep(wait)
        LAST[0]=time.monotonic()
    for attempt in range(2):
        try:
            response=requests.get(url,headers=HEADERS,timeout=(9,18),allow_redirects=True)
            if response.status_code==404:return None
            if response.status_code in (429,500,502,503) and attempt==0:
                time.sleep(4)
                continue
            response.raise_for_status()
            if 'text/html' not in response.headers.get('Content-Type','text/html'):return None
            return response.text
        except requests.RequestException as err:
            if attempt:print(f'HTTP失敗 {url}: {str(err)[:140]}',file=sys.stderr)
    return None

def pet_link_slug(href):
    path=urlparse(href).path.rstrip('/')
    m=re.search(r'/ja/aion-2/pets/([^/]+)$',path)
    return m.group(1) if m and m.group(1)!='sources' else None

def standard_detail(html,expected):
    soup=BeautifulSoup(html,'html.parser')
    title=soup.title.get_text(' ',strip=True) if soup.title else ''
    if normalize(expected) not in normalize(title):return None
    main=soup.find('main') or soup
    text=re.sub(r'\s+','',main.get_text(' ',strip=True))
    # MUST be a summary attached to the named pet, not generic UI/sidebar text.
    m=re.search(re.escape(normalize(expected))+r'の全入手方法[：:]([^。]{3,300})。',normalize(text))
    if not m:return None
    summary=m.group(1)
    count={}
    for key,term,unit in [('boxes','箱','個'),('achievements','実績','件'),('trials','覚醒戦','件'),('monsters','モンスター','体')]:
        found=re.search(re.escape(term)+r'(\d+)'+unit,summary)
        count[key]=int(found.group(1)) if found else 0
    names=[]
    if '黒雲貿易団' in summary:names.append('黒雲貿易団')
    if count['boxes']>0:names.append('箱')
    if count['achievements']>0:names.append('実績')
    if count['trials']>0:names.append('覚醒戦')
    if 'イベント' in summary:names.append('イベント')
    if '商店' in summary and '黒雲貿易団' not in summary:names.append('商店')
    if not names and not count['monsters']:return None
    return {**count,'shop':any(t in names for t in ['黒雲貿易団','商店']),
            'petSources':names,'sourceTypes':[],'sourceStatus':'確認済み',
            'sourceNote':('モンスター由来の魂はWikilyに未掲載。0%・限定という意味ではありません。' if count['monsters']==0 else '')}

def special_detail(html,expected):
    soup=BeautifulSoup(html,'html.parser')
    title=soup.title.get_text(' ',strip=True) if soup.title else ''
    if normalize(expected) not in normalize(title):return None
    main=soup.find('main') or soup
    # Special pets have no aggregate /sources summary. Isolate "入手方法" section.
    heading=next((h for h in main.find_all(['h1','h2','h3']) if h.get_text(' ',strip=True)=='入手方法'),None)
    if not heading:return None
    content=[]
    for sib in heading.next_elements:
        if getattr(sib,'name',None) in ('h1','h2','h3'):break
        if isinstance(sib,str):content.append(sib)
    txt=' '.join(content)[:4000]
    types=[]
    for needle,typ in [('ファウンダーズ','パック'),('アップグレード','パック'),('パック','パック'),('箱','箱'),('商店','ショップ'),('黒雲貿易団','黒雲貿易団'),('イベント','イベント'),('ハロウィン','イベント'),('カボチャ','イベント交換'),('ログイン','ログイン報酬'),('ダンジョン','ダンジョン')]:
        if needle in txt and typ not in types:types.append(typ)
    if not types:return None
    return {'sourceStatus':'確認済み','sourceTypes':types,'petSources':types,
            'monsters':None,'boxes':None,'trials':None,'achievements':None,'shop':'ショップ' in types,
            'sourceNote':'スペシャルの入手手段。現時点で入手できるかはWikilyを参照。'}

def collect_one(row,throttle):
    slug=row.get('slug')
    if not slug or not re.fullmatch(r'[a-z0-9-]+',slug):return None
    special=row['category']=='スペシャル'
    # One canonical endpoint per type. Retry the other host only on failure.
    for host in BASES:
        url=f'{host}/ja/aion-2/pets/{slug}'+('' if special else '/sources')
        html=fetch(url,throttle)
        if not html:continue
        result=special_detail(html,row['name']) if special else standard_detail(html,row['name'])
        if result:
            result['sourceUrl']=url
            result['sourceChecked']=datetime.now(timezone.utc).date().isoformat()
            return result
    return None

def run(args):
    rows=json.loads(DB.read_text('utf-8'))
    if len(rows)!=208 or len({x['name'] for x in rows})!=208:raise ValueError('208件の名前を保護するため中止')
    updates=0;failed=[]
    subset=rows[:args.max] if args.max else rows
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        jobs={pool.submit(collect_one,p,args.throttle):p for p in subset}
        for future in as_completed(jobs):
            pet=jobs[future]
            try: patch=future.result()
            except Exception as ex:
                print(f'取得エラー {pet["name"]}: {ex}',file=sys.stderr);patch=None
            if patch:
                pet.update(patch);updates+=1
                print(f'OK {pet["name"]} | 魂の元={pet["monsters"]} | {pet["sourceUrl"]}')
            else:
                failed.append(pet['name']);print(f'未取得 {pet["name"]}')
    verified=sum(p['sourceStatus']=='確認済み' for p in rows)
    print(f'今回更新 {updates}/{len(subset)}件  /  保持する確認済み {verified}/208件  /  未確認 {208-verified}件')
    if not args.dry_run:
        DB.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        report={'total':208,'verified':verified,'unverified':208-verified,'updatedThisRun':updates,
                'generatedAt':datetime.now(timezone.utc).isoformat(),
                'unverifiedNames':[p['name'] for p in rows if p['sourceStatus']!='確認済み']}
        (ROOT/'coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        with (ROOT/'coverage.csv').open('w',encoding='utf-8-sig',newline='') as f:
            writer=csv.writer(f);writer.writerow(['名前','種族','入手経路の確認','魂の元モンスター数','情報元'])
            for p in rows:writer.writerow([p['name'],p['category'],p['sourceStatus'],p.get('monsters'),p.get('sourceUrl')])
    return 0

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--max',type=int,default=0,help='0=全208件')
    parser.add_argument('--workers',type=int,default=2)
    parser.add_argument('--throttle',type=float,default=1.0)
    parser.add_argument('--dry-run',action='store_true')
    raise SystemExit(run(parser.parse_args()))
