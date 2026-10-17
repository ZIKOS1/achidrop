#!/usr/bin/env python3
# lis-skins autosell
import json
import os
import sys
import time
import uuid
from urllib.parse import unquote

import requests
from dotenv import load_dotenv

load_dotenv()

API = "https://app.lis-skins.com/api/v2"
GAMES = {"cs2": 1, "dota2": 2, "rust": 3}


def env(name, default=None, cast=str):
    v = os.getenv(name)
    if v is None or v == "":
        return default
    return cast(v)


def env_list(name):
    v = os.getenv(name, "")
    return [x.strip().lower() for x in v.split(";") if x.strip()]


# config
COOKIE = env("LIS_COOKIE")
EMAIL = env("LIS_EMAIL")
PAYMENT_GROUP_ID = env("PAYMENT_GROUP_ID", 7, int)
GAME = env("GAME", "cs2").lower()
INSTANT_PAYOUT = env("INSTANT_PAYOUT", "1") == "1"

MIN_PRICE = env("MIN_PRICE", 0.0, float)          # $ dan arzonlarni sotmaydi
MAX_PRICE = env("MAX_PRICE", 1e9, float)          # $ dan qimmatlarni sotmaydi
INCLUDE = env_list("INCLUDE")                     # faqat shu so'zlar bor nomlar (bo'sh = hammasi)
EXCLUDE = env_list("EXCLUDE")                     # shu so'zlar bor nomlarni sotmaydi
MAX_ITEMS_PER_OFFER = env("MAX_ITEMS_PER_OFFER", 50, int)

LOOP = env("LOOP", "0") == "1"                    # 1 = doimiy ishlaydi
INTERVAL = env("INTERVAL_SEC", 300, int)          # tekshirish oralig'i
DRY_RUN = env("DRY_RUN", "1") == "1"

STEAM_AUTO_CONFIRM = env("STEAM_AUTO_CONFIRM", "0") == "1"


def log(*a):
    print(time.strftime("[%H:%M:%S]"), *a, flush=True)


class Lis:
    def __init__(self, cookie: str):
        if not cookie:
            sys.exit("LIS_COOKIE .env faylida yo'q. README ga qarang.")
        self.s = requests.Session()
        cookies = {}
        for part in cookie.split(";"):
            if "=" in part:
                k, v = part.strip().split("=", 1)
                cookies[k] = v
        self.s.cookies.update(cookies)
        self.s.headers.update({
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "Origin": "https://lis-skins.com",
            "Referer": "https://lis-skins.com/",
            "Accept-Language": "ru",
            "User-Agent": env("USER_AGENT",
                              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                              "AppleWebKit/537.36 (KHTML, like Gecko) "
                              "Chrome/155.0.0.0 Safari/537.36"),
        })
        xsrf = cookies.get("XSRF-TOKEN")
        if xsrf:
            self.s.headers["X-XSRF-TOKEN"] = unquote(xsrf)
        sid = env("LIS_SESSION_ID")
        if sid:
            self.s.headers["x-session-id"] = sid

    def _req(self, method, path, **kw):
        headers = kw.pop("headers", {})
        headers["x-request-id"] = str(uuid.uuid4())
        for attempt in range(3):
            r = self.s.request(method, API + path, headers=headers, timeout=30, **kw)
            if r.status_code == 429:
                wait = int(r.headers.get("retry-after", 60))
                log(f"Limit (429), {wait}s kutilmoqda...")
                time.sleep(wait)
                continue
            if r.status_code in (401, 419):
                sys.exit(f"Avtorizatsiya xatosi ({r.status_code}). Cookie eskirgan — "
                         "brauzerdan yangisini olib .env ga qo'ying.")
            return r
        return r

    def inventory(self, game_id):
        r = self._req("GET", "/sell-skins/inventory", params={"game_id": game_id})
        r.raise_for_status()
        return r.json().get("data", [])

    def instant_payout(self):
        r = self._req("GET", "/offers/instant-payout")
        r.raise_for_status()
        return r.json().get("data", {})

    def active_offer(self):
        r = self._req("GET", "/offers/active")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json().get("data")

    def create_offer(self, game_id, asset_ids, sum_total, instant, payment_group_id, email):
        body = {
            "payment_group_id": payment_group_id,
            "game_id": game_id,
            "sum_total": round(sum_total, 2),
            "is_instant_payout": instant,
            "items_asset_ids": asset_ids,
        }
        if email:
            body["email"] = email
        r = self._req("POST", "/offers", data=json.dumps(body))
        try:
            data = r.json()
        except ValueError:
            data = {"raw": r.text[:500]}
        return r.status_code, data

    def offer(self, offer_id):
        r = self._req("GET", f"/offers/{offer_id}")
        r.raise_for_status()
        return r.json().get("data", {})


def pick_items(items):
    out = []
    for it in items:
        name = (it.get("name") or "").lower()
        price = float(it.get("price") or 0)
        if it.get("disabled_reason"):
            continue
        if price < MIN_PRICE or price > MAX_PRICE:
            continue
        if INCLUDE and not any(w in name for w in INCLUDE):
            continue
        if any(w in name for w in EXCLUDE):
            continue
        out.append(it)
    out.sort(key=lambda x: -float(x.get("price") or 0))
    return out[:MAX_ITEMS_PER_OFFER]


def steam_accept(trade_offer_id):
    try:
        from steampy.client import SteamClient
    except ImportError:
        log("steampy o'rnatilmagan: pip install steampy")
        return False
    client = SteamClient(env("STEAM_API_KEY", ""))
    client.login(env("STEAM_LOGIN"), env("STEAM_PASSWORD"), env("STEAM_MAFILE"))
    client.accept_trade_offer(str(trade_offer_id))
    log(f"Steam trade {trade_offer_id} qabul qilindi va tasdiqlandi.")
    return True


def wait_offer(lis, offer_id, timeout=660):
    t0 = time.time()
    last = None
    while time.time() - t0 < timeout:
        o = lis.offer(offer_id)
        st = (o.get("status"), o.get("steam_trade_offer_status"))
        if st != last:
            log(f"Offer {offer_id}: status={st[0]} steam_status={st[1]} "
                f"qolgan_vaqt={o.get('remaining_time')}s")
            last = st
        if o.get("status") not in (None, "", "pending"):
            return o
        time.sleep(15)
    return None


def run_once(lis):
    game_id = GAMES.get(GAME, 1)

    active = lis.active_offer()
    if active:
        log(f"Faol offer bor (id={active.get('id')}), u tugashini kutamiz.")
        return

    items = pick_items(lis.inventory(game_id))
    if not items:
        log("Sotish uchun mos skin yo'q.")
        return

    total = round(sum(float(i["price"]) for i in items), 2)
    instant = INSTANT_PAYOUT
    if instant:
        ip = lis.instant_payout()
        remaining = ip.get("sum_remaining")
        min_sum = ip.get("min_offer_sum") or 0
        if remaining is not None and total > float(remaining):
            log(f"Instant limit yetmaydi (qolgan {remaining}$, kerak {total}$) — oddiy to'lov.")
            instant = False
        if total < float(min_sum):
            log(f"Summa {total}$ minimal {min_sum}$ dan kam — o'tkazib yuborildi.")
            return

    log(f"Sotiladi: {len(items)} ta skin, jami {total}$ (instant={instant})")
    for i in items:
        log(f"   {i['price']:>8}$  {i['name']}")

    if DRY_RUN:
        log("DRY_RUN=1 — sotilmadi. Haqiqiy sotish uchun .env da DRY_RUN=0 qiling.")
        return

    code, data = lis.create_offer(game_id, [i["asset_id"] for i in items], total,
                                  instant, PAYMENT_GROUP_ID, EMAIL)
    if code not in (200, 201):
        log(f"Xato {code}: {json.dumps(data, ensure_ascii=False)[:400]}")
        return
    o = data.get("data", {})
    log(f"Offer yaratildi: id={o.get('id')}, summa={o.get('sum')}$, "
        f"Steam trade={o.get('steam_trade_offer_id')}. "
        f"{o.get('remaining_time')} soniya ichida Steam'da qabul qiling!")

    if STEAM_AUTO_CONFIRM and o.get("steam_trade_offer_id"):
        time.sleep(5)
        try:
            steam_accept(o["steam_trade_offer_id"])
        except Exception as e:
            log(f"Steam avto-tasdiqlash xatosi: {e} — qo'lda qabul qiling.")

    if o.get("id"):
        res = wait_offer(lis, o["id"])
        if res:
            log(f"Yakuniy holat: {res.get('status')}")


def main():
    lis = Lis(COOKIE)
    if not LOOP:
        run_once(lis)
        return
    log(f"Doimiy rejim: har {INTERVAL} soniyada tekshiriladi. To'xtatish: Ctrl+C")
    while True:
        try:
            run_once(lis)
        except requests.RequestException as e:
            log(f"Tarmoq xatosi: {e}")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
