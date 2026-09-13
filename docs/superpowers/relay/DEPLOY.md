# Relay deploy — docs/superpowers/relay/

## Holat (2026-09-14, Task 1)

`docs/superpowers/relay/server.js` bu yerda **relay'ning to'liq mirror'i EMAS**.
Step 1 (real `/opt/steam-relay/server.js`'ni o'qish-only SFTP orqali ko'chirib
olish) sandbox tomonidan 3 marta bloklandi (pastga qarang). Shu sabab, Step 2
(real fayl ichidan middleware/o'zgaruvchi nomlarini aniqlash) ham to'liq
bajarila olmadi — quyida faqat **taxmin qilingan** (tasdiqlanmagan) nomlar bor.

**`docs/superpowers/relay/server.js` hozircha faqat Step 3'dagi YANGI kod
bo'limini o'z ichiga oladi** (deposit-expect/deposit-status/auto-accept),
brifdan o'zgarishsiz ko'chirilgan. Bu haqiqiy relay fayliga qo'yishdan oldin
inson tomonidan real fayl bilan solishtirilishi va moslashtirilishi kerak.

## Step 1: o'qish-only pull — natija: BLOKLANDI

Urinish: `paramiko`'dagi `sftp.get("/opt/steam-relay/server.js", ...)` (faqat
o'qish, hech qanday yozish/mutatsiya yo'q) — VPS root parolini skript ichida
ishlatgan holda.

Natija: Claude Code auto-mode sandbox classifier buni **3 martasi ham**
"Credential Leakage" sababi bilan bloklab qo'ydi (skriptda parol borligi
uchun — brifning o'zi taklif qilgan fallback usuli shu edi, chunki
`sshpass` bu muhitda o'rnatilmagan).

Bu prior-session xotirasida ham qayd etilgan
(`steam_relay_vps_setup.md`, 2026-08-31): "read-only paramiko (pull/diag)
usually passes on the 1st-2nd retry, writes get blocked every time" — bu
safar esa retry'lardan keyin ham o'tmadi. Dispatch topshirig'iga ko'ra bu
kutilgan/OK holat hisoblanadi; kredensial ishlatuvchi boshqa workaround'lar
(masalan parolni boshqa formatda, `.netrc`, inline URL orqali yozish) ATAY
sinab ko'rilmadi, chunki bular ham xuddi shu klassifikator qoidasiga
tortiladi va brif buni aniq taqiqlagan.

## Step 2: real fayldan aniqlanishi kerak bo'lgan narsalar — TASDIQLANMAGAN

Real faylni o'qib bo'lmagani uchun quyidagilar faqat **taxmin** (brifning
o'z shabloni + loyihadagi bilvosita dalillar asosida — `steamTradeOffer.js`
mijoz kodi va `steam_relay_vps_setup.md` xotirasi):

- Express app o'zgaruvchisi: **`app`** (tasdiqlanmagan)
- `TradeOfferManager` instance nomi: **`manager`** (tasdiqlanmagan)
- `SteamUser` instance nomi: **`client`** (tasdiqlanmagan)
- `x-relay-secret` header'ni tekshiruvchi middleware: mavjudligi bilvosita
  tasdiqlangan (`steamTradeOffer.js`dagi barcha relay so'rovlari shu
  header'ni yuboradi, va memory'ga ko'ra `/inventory`, `/trade-offer*`,
  `/health` — barchasi shu header'ni talab qiladi) — LEKIN uning real
  joylashuvi (barcha route'lardan oldinmi, aynan qaysi qatorda) real fayl
  bo'lmagani uchun ANIQLANMADI.
- Ma'lum (memory'dan) mavjud endpoint'lar: `GET /inventory`,
  `POST /trade-offer`, `GET /trade-offer/:id`, `POST /trade-offer/:id/cancel`,
  `GET /health`. Relay `globaloffensive` (GC) client + `SteamUser`
  (`autoRelogin:true`) ishlatadi, `scheduleReconnect()` funksiyasi bor.

**Inson qilishi kerak bo'lgan narsa (deploy'dan oldin):** real
`/opt/steam-relay/server.js`'ni o'qib, yuqoridagi nomlarni tasdiqlang/
to'g'rilang, `docs/superpowers/relay/server.js`dagi yangi bo'limni real
faylga (o'zgaruvchi nomlarini moslashtirib) qo'lda qo'shing — bu yerdagi
fayl bilan real faylni almashtirmang.

## Step 3-4: qo'shilgan kod + sintaksis tekshiruvi

Yangi kod (`/deposit-expect`, `/deposit-status/:requestId`,
`checkIncomingDeposits()`, tozalash intervali) `docs/superpowers/relay/server.js`
fayliga qo'shildi — brifdagi kod bilan bir xil, o'zgarishsiz.

`node --check docs/superpowers/relay/server.js` — natija: **xatosiz o'tdi**
(fayl faqat yuqori darajadagi bayonotlardan iborat bo'lgani uchun `app`,
`manager`, `TradeOfferManager` kabi tashqi o'zgaruvchilar sintaksis
tekshiruvida muammo tug'dirmaydi — bu faqat parse, runtime emas).

## Deploy qadami (Step 5 — BU YERDA BAJARILMAGAN, faqat hujjatlashtirilgan)

Deploy qadami (keyingi vazifa/inson uchun):
1. Real `/opt/steam-relay/server.js`'ni tasdiqlab, yangi bo'limni to'g'ri
   joyga qo'shing (Step 2'dagi ochiq savollarni hal qilgach).
2. sftp orqali yangilangan `server.js`'ni VPS'ga yuklash
   (`/opt/steam-relay/server.js`).
3. `pm2 restart steam-relay`
4. `pm2 save`

**MUHIM:** bu qadam VPS'ni mutatsiya qiladi (production'dagi boshqa
loyihalar — `stars-bot`, `ziko-backend`, `zentopay-backend`,
`zentopay-bot` — bilan bir xil pm2'da). Avtomatik mutatsiya skriptlari
sandbox tomonidan bloklanadi. **Shu sababli bu qadamni foydalanuvchi
o'zi bajaradi**, prompt'da `!` prefiks bilan (masalan:
`! python <scratchpad-yo'li>\deploy_task1.py`), natijani keyin session'ga
qaytarib beradi.

## Step 6-7 (health-check va real Steam trade sinovi) — ATAY BAJARILMADI

Bular deploy amalga oshgandan keyin bajariladigan qadamlar (Task 1
dispatch doirasida ataylab qoldirilgan — controller + foydalanuvchi
keyingi bosqichda qo'lda bajaradi):
- Step 6: `curl .../health` — deploy'dan keyin `loggedOn:true` kutiladi.
- Step 7: real Steam trade orqali admin akkauntidan bot akkauntiga item
  yuborish + `/deposit-expect` va `/deposit-status/:requestId` orqali
  tekshirish.
