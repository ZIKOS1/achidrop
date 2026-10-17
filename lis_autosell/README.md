# LIS-SKINS avto-sotish

## O'rnatish
```bash
pip install requests python-dotenv
# Steam avto-tasdiqlash kerak bo'lsa:
pip install steampy
```

## Sozlash
1. `.env.example` ni `.env` deb nusxalang.
2. `LIS_COOKIE` ga brauzerdagi to'liq cookie qatorini qo'ying (Chrome → F12 → Network → `app.lis-skins.com` so'rovi → Request Headers → `cookie`).
3. `LIS_EMAIL` ni to'ldiring, narx filtrlarini sozlang.

## Ishga tushirish
```bash
python lis_autosell.py          # DRY_RUN=1: nima sotilishini ko'rsatadi, sotmaydi
```
Ro'yxat to'g'ri bo'lsa `.env` da `DRY_RUN=0`, doimiy ishlashi uchun `LOOP=1` qiling.

## Qanday ishlaydi
1. Faol sotuv bormi tekshiradi (bo'lsa kutadi).
2. Inventarni narxlari bilan oladi, filtrlar bo'yicha skin tanlaydi.
3. Instant to'lov limitini tekshiradi.
4. `POST /offers` bilan sotuv yaratadi → LIS boti Steam'da sizga trade yuboradi.
5. Trade'ni **10 daqiqa ichida** Steam'da qabul qilish kerak (yoki `STEAM_AUTO_CONFIRM=1`).

## Muhim
- Cookie va `.env` — akkauntingiz kaliti. Hech kimga bermang.
- Cookie vaqt o'tib eskiradi: 401/419 xatosi chiqsa, yangisini oling.
- Bu saytning rasmiy API'si emas: sayt uni o'zgartirsa skript buzilishi mumkin, qoidalarga zid deb hisoblanib akkaunt cheklanishi ham mumkin.
- Tez-tez qabul qilinmagan sotuvlar akkauntga cheklov olib kelishi mumkin — trade'larni o'z vaqtida qabul qiling.
