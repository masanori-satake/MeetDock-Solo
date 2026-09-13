## 2026/09/13 - formatToParts 解析時の Map / 中間配列生成の削減
**学び:** `Intl.DateTimeFormat.prototype.formatToParts()` の結果からパーツ（year, month, day, hour, minute, second）を抽出する際、`parts.map()` や `new Map()` を使用すると、頻繁に呼び出される関数内で毎回不要な配列・Map オブジェクトのメモリ割り当てが発生し GC 負荷が高くなる。パーツ配列に対する単一の `for` ループと `switch` 文による直接変数へのパース代入へ変更することで、解析中に追加で発生する中間配列と `Map` のメモリ割り当てを削減し、処理速度が約 44% 向上する。ただし、`formatToParts()` 自体はパーツ配列と各レコードを生成する。
**アクション:** `formatToParts()` の結果をパースする際は、`Map` や配列メソッドを介さず直接 `for` ループと `switch` 文で解析する。

## 2026/09/13 - Intl.DateTimeFormat キャッシュと Decorate-Sort-Undecorate による計算コストの削減
**学び:** `getZonedDateParts` による繰り返し計算や日付判定で `new Intl.DateTimeFormat(...)` を都度生成すると V8 エンジンでのオブジェクト生成コストが高くなる。また、`Array.prototype.sort()` の比較関数内で `new Date(startTime)` を生成すると $O(N \log N)$ 回のインスタンス生成とパースが発生する。開始日時のエポックタイムスタンプを $O(N)$ で事前計算してソート（Schwartzian transform）することで、タイムゾーンオフセット表記に関わらず正確な時系列順を保ちつつ GC 負荷と計算時間を大幅に低減できる。
**アクション:** 今後、タイムゾーン変換や日付ソートの処理を行う際は、`Intl.DateTimeFormat` を Map でキャッシュし、配列ソートには事前計算タイムスタンプを用いた comparator を利用する。
