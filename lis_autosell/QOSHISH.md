# Saytga qo'shish

`server.py` skriptni oddiy HTTP API qiladi. Saytingiz qaysi tilda bo'lmasin, unga so'rov yuborib ishlatadi.

## 1. Ishga tushirish

### Kompyuterda / VPS'da
```bash
pip install -r requirements.txt
cp .env.example .env      # LIS_COOKIE, LIS_EMAIL, API_KEY ni to'ldiring
python server.py          # http://localhost:8000
```

### Railway'da (24/7, kompyutersiz)
1. Papkani GitHub'ga yuklang (`.env` faylini YUKLAMANG).
2. Railway → New Project → GitHub repo.
3. Variables bo'limiga `.env` dagi qiymatlarni qo'shing.
4. Railway `Procfile` ni o'zi topib ishga tushiradi va manzil beradi.

## 2. Endpointlar
Har so'rovda sarlavha: `X-Api-Key: <API_KEY>`

| So'rov | Vazifa |
|---|---|
| `GET /inventory?game=cs2` | Inventar + filtr bo'yicha sotiladiganlar |
| `GET /limits` | Instant to'lov limiti |
| `GET /offer/active` | Faol sotuv |
| `GET /offer/{id}` | Sotuv holati |
| `POST /sell` | Sotish |

`POST /sell` tanasi (hammasi ixtiyoriy):
```json
{"asset_ids": ["53462525353"], "game": "cs2", "instant": true, "dry_run": false}
```
`asset_ids` berilmasa — `.env` dagi filtrlar bo'yicha tanlanadi. `dry_run: true` — faqat ko'rsatadi, sotmaydi.
Narxlar har doim serverda LIS'dan olinadi, saytdan kelgan summaga ishonilmaydi.

## 3. Tayyor misollar

### curl
```bash
curl -H "X-Api-Key: KALIT" http://localhost:8000/inventory
curl -X POST -H "X-Api-Key: KALIT" -H "Content-Type: application/json" \
     -d '{"dry_run": true}' http://localhost:8000/sell
```

### PHP / WordPress
```php
function lis_api($path, $body = null) {
    $ch = curl_init("https://SERVER_MANZILI" . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ["X-Api-Key: KALIT", "Content-Type: application/json"],
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $res = json_decode(curl_exec($ch), true);
    curl_close($ch);
    return $res;
}

$inv  = lis_api("/inventory");
$sold = lis_api("/sell", ["asset_ids" => $inv["to_sell"]]);
```

### Node.js
```js
const API = "https://SERVER_MANZILI", KEY = process.env.LIS_API_KEY;
const lis = (path, body) => fetch(API + path, {
  method: body ? "POST" : "GET",
  headers: { "X-Api-Key": KEY, "Content-Type": "application/json" },
  body: body && JSON.stringify(body),
}).then(r => r.json());

const inv = await lis("/inventory");
const res = await lis("/sell", { asset_ids: inv.to_sell });
```

### Python (Telegram bot va h.k.)
```python
import requests
H = {"X-Api-Key": "KALIT"}
inv = requests.get("https://SERVER_MANZILI/inventory", headers=H).json()
res = requests.post("https://SERVER_MANZILI/sell", headers=H, json={"asset_ids": inv["to_sell"]}).json()
```

## Xavfsizlik
- `API_KEY` faqat saytingizning **server** kodida tursin — brauzerdagi JavaScript'ga qo'ymang, aks holda har kim sizning skinlaringizni sota oladi.
- `.env` ni GitHub'ga yuklamang.
