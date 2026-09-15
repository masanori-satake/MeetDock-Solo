## 2026/09/13 - formatToParts 解析時の Map / 中間配列生成の削減
**学び:** `Intl.DateTimeFormat.prototype.formatToParts()` の結果からパーツ（year, month, day, hour, minute, second）を抽出する際、`parts.map()` や `new Map()` を使用すると、頻繁に呼び出される関数内で毎回不要な配列・Map オブジェクトのメモリ割り当てが発生し GC 負荷が高くなる。パーツ配列に対する単一の `for` ループと `switch` 文による直接変数へのパース代入へ変更することで、解析中に追加で発生する中間配列と `Map` のメモリ割り当てを削減し、処理速度が約 44% 向上する。ただし、`formatToParts()` 自体はパーツ配列と各レコードを生成する。
**アクション:** `formatToParts()` の結果をパースする際は、`Map` や配列メソッドを介さず直接 `for` ループと `switch` 文で解析する。

## 2026/09/13 - Intl.DateTimeFormat キャッシュと Decorate-Sort-Undecorate による計算コストの削減
**学び:** `getZonedDateParts` による繰り返し計算や日付判定で `new Intl.DateTimeFormat(...)` を都度生成すると V8 エンジンでのオブジェクト生成コストが高くなる。また、`Array.prototype.sort()` の比較関数内で `new Date(startTime)` を生成すると $O(N \log N)$ 回のインスタンス生成とパースが発生する。開始日時のエポックタイムスタンプを $O(N)$ で事前計算してソート（Schwartzian transform）することで、タイムゾーンオフセット表記に関わらず正確な時系列順を保ちつつ GC 負荷と計算時間を大幅に低減できる。
**アクション:** 今後、タイムゾーン変換や日付ソートの処理を行う際は、`Intl.DateTimeFormat` を Map でキャッシュし、配列ソートには事前計算タイムスタンプを用いた comparator を利用する。

## 2026/09/15 - タイムゾーン正規化時の無効文字列キャッシュと Outlook エイリアス追加による V8 例外の回避
**学び:** Outlook 等から出力された .ics ファイルに含まれる `TZID`（例: `"Tokyo Standard Time"`）が標準 IANA 名や既存エイリアスに存在しない場合、`normalizeTimeZone` 内で `new Intl.DateTimeFormat('en-US', { timeZone: clean })` が呼び出されて V8 エンジン内で例外 (`RangeError`) が発生する。また、`validTimeZoneCache` は正常な IANA 名のみをキャッシュするため、無効・未対応なタイムゾーン文字列が渡されるたびに例外スローが繰り返され、10,000 回の呼び出しで約 520ms を消費する重大なボトルネックとなっていた。`normalizedTimeZoneCache` (`Map`) を導入して `undefined`（無効結果）を含むルックアップ結果を丸ごとキャッシュし、さらに `"Tokyo Standard Time"` などの標準的な Outlook タイムゾーン名を `TIME_ZONE_ALIASES` に追加することで、例外発生コストを回避して .ics ファイルのパース速度を約 80% 向上（7.5秒 -> 1.46秒）させることができる。
**アクション:** タイムゾーン正規化などの外部文字列変換・バリデーション処理では、正常値だけでなく無効/未対応結果も含めてキャッシュし、例外スローが発生するパスを極力回避する。
