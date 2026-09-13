## 2026/09/13 - Intl.DateTimeFormat キャッシュと ISO 8601 文字列比較ソートによる計算コストの削減
**学び:** `getZonedDateParts` による繰り返し計算や日付判定で `new Intl.DateTimeFormat(...)` を都度生成すると V8 エンジンでのオブジェクト生成コストが高くなる。また、`Array.prototype.sort()` の比較関数内で `new Date(ISO_STRING)` を生成すると $O(N \log N)$ 回のインスタンス生成とパースが発生する。ISO 8601 形式の UTC 文字列は辞書順比較がそのまま時系列比較と一致するため、文字列比較にするだけで GC 負荷と計算時間を大幅に低減できる。
**アクション:** 今後、タイムゾーン変換や日付ソートの処理を行う際は、`Intl.DateTimeFormat` を Map でキャッシュし、ISO 文字列のソートには直接比較 comparator を利用する。
