# Conciliación del Libro de Compras — julio 2026

Empresa: PANADERIA Y PASTELERIA LA MANSION DE SUCRE, C.A. · RIF J-297678182 · PDF emitido el 06/08/2026.

## Criterio

- Fuente oficial: PDF del Libro de Compras.
- Tolerancia monetaria: Bs 0,01.
- Bases fiscales: PDF contra la suma de `vat_base` de las partidas de Supabase.
- No se modificó ningún registro de Supabase.

## Resultado ejecutivo

Se emparejaron 72 de 72 operaciones. 64 presentan diferencias y 8 quedan conciliadas.

## KPIs — PDF contra Supabase

| KPI | PDF oficial | Supabase encabezados | Diferencia Supabase - PDF |
|---|---:|---:|---:|
| Total compras | Bs 2.897.746,90 | Bs 2.898.459,22 | Bs 712,32 |
| Compras exentas | Bs 1.269.210,36 | Bs 1.242.524,21 | Bs -26.686,15 |
| Base gravada | Bs 1.403.911,97 | Bs 1.431.476,19 | Bs 27.564,22 |
| IVA compras | Bs 224.624,57 | Bs 220.970,82 | Bs -3.653,75 |
| Retención vendedor | Bs 173.062,59 | Bs 0,00 | Bs -173.062,59 |

## Control de bases por partidas

Supabase suma por partidas: exentas Bs 1.292.932,69 y base gravada Bs 1.474.877,64. Los encabezados usados por la pantalla muestran exentas Bs 1.242.524,21 y base Bs 1.431.476,19; ambas capas deben unificarse antes de aceptar los KPIs.

## Facturas con diferencias

| Op. | Doc. PDF | Control PDF | Doc. Supabase | Control Supabase | Diferencias detectadas |
|---:|---|---|---|---|---|
| 1 | 7072684619 | 09-3347209 | 7072684619 | 09-3347209 | retention -8.356,30 |
| 2 | 1847022567 | 00-1974564 | 184022567 | 00-1974564 | documento PDF 1847022567 vs Supabase 184022567 |
| 3 | 7072686326 | 09-3348963 | 7072686326 | 09-3348963 | total -0,33; base -0,32; vat -0,04; retention -9.525,32 |
| 4 | 7783079111 | 00-41049513 | 7783079111 | 00-41049513 | retention -2.910,95 |
| 5 | 1754452 | 00-2472495 | 1754452 | 00-2472495 | retention -3.246,37 |
| 6 | 3595372136 | 00-31717787 | 3595372136 | 00-31717787 | total +1,04; exempt -3.488,00; vat +1,04; retention -3.229,67 |
| 7 | 7072687440 | 09-3350124 | 7072687440 | 09-3350124 | retention -13.726,09 |
| 8 | 7072688961 | 09-3351725 | 7072688961 | 09-3351725 | retention -7.687,65 |
| 9 | 7783084608 | 00-41055055 | 7783084608 | 00-41055055 | total -0,16; base -0,14; vat -0,02; retention -1.930,82 |
| 10 | C93417055 | 00-6681731 | 93417055 | 00-6681731 | documento PDF C93417055 vs Supabase 93417055; total -3,47; base -3,00; vat -0,47; retention -3.605,24 |
| 11 | 7783086375 | 00-41056826 | 7793086375 | 00-41056826 | documento PDF 7783086375 vs Supabase 7793086375; total -0,21; exempt -0,07; base -0,11; vat -0,02; retention -2.293,46 |
| 12 | 3587902965 | 00-29620151 | 3587902965 | 00-29620151 | fecha PDF 28/05/2026 vs Supabase 2026-03-17; base +6.286,12; retention +377,16 |
| 13 | 6070284312 | 08-1211113 | 6070284312 | 08-1211113 | fecha PDF 28/05/2026 vs Supabase 2026-03-31; base +48.145,22; retention +2.888,71 |
| 14 | 6070284313 | 08-1211114 | 6070284313 | 00-1211114 | control PDF 08-1211114 vs Supabase 00-1211114; fecha PDF 28/05/2026 vs Supabase 2026-03-31; base +39.378,62; retention +2.362,71 |
| 15 | 8098027453 | 00-3658106 | 8098027453 | 00-3658106 | total -0,02; base -0,02; retention -882,07 |
| 16 | 12517 | 00-954850 | 12517 | 00-954850 | retention -2.509,17 |
| 17 | 7783089092 | 00-41059544 | 7783089092 | 00-41059544 | total +0,18; base +0,15; vat +0,03; retention -2.336,57 |
| 18 | 3595373764 | 00-3171944 | 3595373764 | 00-31719444 | control PDF 00-3171944 vs Supabase 00-31719444; total -3.488,14; exempt -3.488,00; base -0,12; vat -0,02; retention -1.997,55 |
| 19 | 7072691793 | 09-3354665 | 7072691793 | 09-3354665 | total -26,67; base -22,99; vat -3,68; retention -10.888,53 |
| 20 | 7072691794 | 09-3354666 | 7072691794 | 09-3354666 | total -0,02; base -0,02; retention -403,08 |
| 21 | 3595373892 | 00-31719576 | 3595373892 | 00-31719576 | total -599,79; exempt +3.748,47; base -3.748,50; vat -599,76; retention -449,82 |
| 22 | 7072692217 | 09-3355098 | 7072692217 | 09-3355098 | total -6,88; base -5,93; vat -0,95; retention -6.573,00 |
| 23 | 8098027817 | 00-3658453 | 8098027817 | 00-3658453 | total +135,24; exempt +7.322,77; base -6.196,15; vat -991,38; retention -3.379,73 |
| 24 | 3595374485 | 0031720174 | 3595374485 | 00-31720174 | control PDF 0031720174 vs Supabase 00-31720174; total -3.717,04; exempt -3.488,00; base -197,45; vat -31,59; retention -3.062,08 |
| 25 | 7072693733 | 09-3356691 | 7072693733 | 09-3356691 | total -720,39; base -621,03; vat -99,36; retention -9.456,00 |
| 26 | C93419038 | 00-6683909 | 93419038 | 00-6683909 | documento PDF C93419038 vs Supabase 93419038; total +1,85; base +1,60; vat +0,25; retention -1.608,76 |
| 27 | 1757504 | 1757504 | — | — | No se encontró factura en Supabase |
| 28 | 147359 | 00-162216 | 147359 | 00-162216 | total -13,31; base -11,48; vat -1,83; retention -1.368,09 |
| 29 | 3595375439 | 00-31721151 | 3595375439 | 00-31721151 | fecha PDF 15/06/2026 vs Supabase 2026-06-20; total -4.509,28; exempt -6.256,00; base +1.506,20; vat +240,52; retention -5.313,09 |
| 30 | 5374 | 00-00005674 | 00005374 | 00-00005674 | documento PDF 5374 vs Supabase 00005374; retention -2.334,59 |
| 31 | 7072695972 | 09-3359038 | 7072695972 | 09-3359038 | total +1.711,14; base +1.475,12; vat +236,02; retention -12.403,88 |
| 32 | 7072695973 | 09-3359039 | 7072695973 | 09-3359039 | total -67,42; base -58,13; vat -9,29; retention -10.504,93 |
| 33 | 7783097624 | 00-41068299 | 7783097624 | 00-41068299 | total -837,88; exempt +0,19; base -722,48; vat -115,59; retention -632,28 |
| 34 | 7072696873 | 09-3359978 | 7072696873 | 09-3359978 | total -13,36; base -12,13; vat -1,23; retention -5.912,63 |
| 35 | 12864 | 00-965551 | 12864 | 00-965551 | retention -1.395,14 |
| 37 | 3595376396 | 00-31722114 | 3595376396 | 00-31722114 | total -6.256,11; exempt -6.256,00; base -0,10; retention -2.190,06 |
| 38 | 7783101801 | 00-41072505 | 7783101801 | 00-41072505 | total -0,06; base -0,05; retention -1.288,31 |
| 40 | 3595376784 | 00-31722507 | 3595376784 | 00-31722507 | retention -1.129,94 |
| 41 | 7072699754 | 09-3362958 | 7172699754 | 09-3362958 | documento PDF 7072699754 vs Supabase 7172699754; total +1.095,65; exempt +3.741,61; base -2.281,00; vat -364,96; retention -13.579,43 |
| 42 | 7783104160 | 00-41074907 | 7783104160 | 00-41074907 | total -0,23; exempt -0,23 |
| 43 | 017712 | 00-017712 | 017712 | 00-017712 | total -0,05; exempt -0,05 |
| 45 | 8060047190 | 00-41078321 | 8060047190 | 00-41078321 | total -25,80; exempt -25,80 |
| 46 | 017746 | 00-017746 | 017746 | 00-017746 | total -0,04; exempt -0,04 |
| 47 | 41542 | Z7C7025745 | — | — | No se encontró factura en Supabase |
| 49 | 017757 | 00-017757 | 017757 | 00-017757 | total -0,10; exempt -0,10 |
| 50 | 42044 | Z7C7025745 | — | — | No se encontró factura en Supabase |
| 52 | 456 | 00-000456 | 456 | 00-000456 | retention -18.344,82 |
| 53 | 1615 | FD10005296 | — | — | No se encontró factura en Supabase |
| 55 | 31630460 | Z7C7022790 | 31630460 | 31630460 | control PDF Z7C7022790 vs Supabase 31630460 |
| 56 | 017886 | 00-017886 | 017886 | 00-017886 | total -0,03; exempt -0,03 |
| 58 | 91465 | Z7C7028397 | — | — | No se encontró factura en Supabase |
| 59 | 96779 | Z7C7025637 | — | — | No se encontró factura en Supabase |
| 60 | 96908 | Z7C7025637 | — | — | No se encontró factura en Supabase |
| 62 | 1636 | FD10005296 | — | — | No se encontró factura en Supabase |
| 63 | 30611 | Z7C7028238 | — | — | No se encontró factura en Supabase |
| 64 | 81577 | Z7C7028243 | — | — | No se encontró factura en Supabase |
| 65 | 31644950 | Z7C7022799 | 31644950 | 31644950 | control PDF Z7C7022799 vs Supabase 31644950 |
| 66 | 71106 | Z7C7028152 | — | — | No se encontró factura en Supabase |
| 67 | 1653 | FD10005296 | — | — | No se encontró factura en Supabase |
| 68 | 229302 | Z1F0015500 | — | — | No se encontró factura en Supabase |
| 69 | 31647480 | Z7C7022799 | 31647480 | 31647480 | control PDF Z7C7022799 vs Supabase 31647480 |
| 70 | 31647908 | Z7C7022799 | 31647908 | 31647908 | control PDF Z7C7022799 vs Supabase 31647908 |
| 71 | 44142 | Z7C7025745 | — | — | No se encontró factura en Supabase |
| 72 | 0000033658 | 00-039338 | 0000033658 | 00-039338 | fecha PDF 31/07/2026 vs Supabase 2026-07-16 |

## Hallazgos prioritarios

- El PDF reporta Bs 173.062,59 de IVA retenido al vendedor; Supabase reporta Bs 0,00.
- Deben validarse los documentos `7783086375/7793086375`, `7072699754/7172699754`, `1847022567/184022567` y el control `08-1211114/00-1211114`.
- Los KPIs iniciales (total Bs 3.007.278,78; base Bs 1.525.286,15; IVA Bs 235.980,42) no coinciden con el PDF ni con Supabase.

## Próximo paso recomendado

Validar las filas marcadas contra las facturas y comprobantes originales. Corregir primero identificación/clasificación y después recalcular importes y retenciones. Este informe no aplica cambios automáticamente.
