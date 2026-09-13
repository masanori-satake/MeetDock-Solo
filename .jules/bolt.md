## 2026/09/13 - Intl.DateTimeFormat キャッシュと Decorate-Sort-Undecorate による計算コストの削減
**学び:** `getZonedDateParts` による繰り返し計算や日付判定で `new Intl.DateTimeFormat(...)` を都度生成すると V8 エンジンでのオブジェクト生成コストが高くなる。また、`Array.prototype.sort()` の比較関数内で `new Date(startTime)` を生成すると $O(N \log N)$ 回のインスタンス生成とパースが発生する。開始日時のエポックタイムスタンプを $O(N)$ で事前計算してソート（Schwartzian transform）することで、タイムゾーンオフセット表記に関わらず正確な時系列順を保ちつつ GC 負荷と計算時間を大幅に低減できる。
**アクション:** 今後、タイムゾーン変換や日付ソートの処理を行う際は、`Intl.DateTimeFormat` を Map でキャッシュし、配列ソートには事前計算タイムスタンプを用いた comparator を利用する。
