# Qurol thumbnail iconlari

Auksion sahifasidagi kategoriya-filtr dropdown'ida har bir qurol qatorida
ko'rsatiladigan kichik icon. Rasm shu papkada topilmasa oddiy neytral fon
qutisi ko'rinadi (buzuq-rasm belgisi chiqmaydi).

**Manba**: [Juknum/counter-strike-icons](https://github.com/Juknum/counter-strike-icons)
(`cs2/panorama/images/icons/equipment/*.svg`) — CS2'ning o'zidagi rasmiy HUD
equipment iconlari, oq rangda (`fill="#FFFFFF"`), qora fonga mos. Bu fayllar
Valve Corporation'ga tegishli o'yin assetlari — repo o'zi "community/ta'lim
maqsadida" deb belgilagan; loyihada allaqachon Steam CDN'dan skin rasmlari
xuddi shu tarzda ishlatiladi (`AuctionCard.jsx`), shu sabab bir xil
kategoriyadagi foydalanish.

**Fayl nomi qoidasi**: qurol nomi kichik harflarga o'tkaziladi, bo'shliq va
maxsus belgilar `-` bilan almashtiriladi, `.svg` qo'shiladi (`weaponImagePath()`,
`miniapp/src/utils.js`). Masalan "M9 Bayonet" -> `m9-bayonet.svg`.

**Qo'lqoplar** (`qolqop` kategoriyasi, 8 ta nom) — CS2 HUD'da qo'lqop
skinlari uchun alohida icon yo'q, barchasi bitta umumiy
`clothing_hands.svg`dan nusxa olingan (`sport-gloves.svg`,
`specialist-gloves.svg` va h.k. — barchasi bir xil rasm).

Barcha 61 fayl allaqachon shu papkada mavjud — qo'shimcha ish shart emas.
