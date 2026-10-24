import unittest
from update_sources import standard_detail,special_detail,pet_link_slug

class TestWikiParser(unittest.TestCase):
    def html(self,title,body):return f'<html><head><title>{title}</title></head><body><main>{body}</main></body></html>'
    def test_standard(self):
        d=standard_detail(self.html('上級地の精霊ペット - 入手場所','<h1>上級地の精霊の入手先</h1><p>上級地の精霊の全入手方法：黒雲貿易団、箱2個、実績1件、覚醒戦8件、モンスター3体。</p>'),'上級地の精霊')
        self.assertEqual(d['monsters'],3);self.assertEqual(d['boxes'],2);self.assertEqual(d['trials'],8);self.assertEqual(d['achievements'],1)
    def test_missing_monsters_in_summary_is_not_dungeon_only(self):
        d=standard_detail(self.html('最上級地の精霊ペット','<p>最上級地の精霊の全入手方法：黒雲貿易団、箱2個、実績1件、覚醒戦8件。</p>'),'最上級地の精霊')
        self.assertEqual(d['monsters'],0);self.assertFalse('ダンジョン' in ' '.join(d['petSources']))
    def test_refuse_wrong_pet(self):
        self.assertIsNone(standard_detail(self.html('パピスペット','<p>パピスの全入手方法：黒雲貿易団、箱2個、モンスター12体。</p>'),'カイリン'))
    def test_refuse_missing_summary(self):
        self.assertIsNone(standard_detail(self.html('カイリンペット','<p>黒雲貿易団、箱、実績。</p>'),'カイリン'))
    def test_special_only_section(self):
        d=special_detail(self.html('ペット ブラック ドラゴン','<h2>入手方法</h2><ul><li>ディーヴァの権能箱</li><li>アルティメット ファウンダーズ パック</li><li>商店</li></ul><h2>同じ入手先</h2><p>イベント</p>'),'ブラック ドラゴン')
        self.assertEqual(set(d['sourceTypes']),{'パック','箱','ショップ'});self.assertIsNone(d['monsters'])
    def test_slug(self):self.assertEqual(pet_link_slug('https://new.wikily.gg/ja/aion-2/pets/young-ursus/'),'young-ursus')
if __name__=='__main__':unittest.main()
