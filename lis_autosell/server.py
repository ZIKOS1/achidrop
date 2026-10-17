#!/usr/bin/env python3
# lis-skins autosell http api
import os
import time
from functools import wraps

from flask import Flask, jsonify, request

import lis_autosell as core

app = Flask(__name__)
API_KEY = os.getenv("API_KEY", "")
_client = None


def client():
    global _client
    if _client is None:
        _client = core.Lis(core.COOKIE)
    return _client


def auth(f):
    @wraps(f)
    def w(*a, **kw):
        if not API_KEY:
            return jsonify(error="API_KEY sozlanmagan"), 500
        key = request.headers.get("X-Api-Key") or request.args.get("key")
        if key != API_KEY:
            return jsonify(error="unauthorized"), 401
        try:
            return f(*a, **kw)
        except SystemExit as e:
            return jsonify(error=str(e)), 401
        except Exception as e:
            return jsonify(error=str(e)), 502
    return w


def game_id():
    g = (request.args.get("game") or (request.get_json(silent=True) or {}).get("game")
         or core.GAME).lower()
    return core.GAMES.get(g, 1)


@app.get("/health")
def health():
    return jsonify(ok=True, time=int(time.time()))


@app.get("/inventory")
@auth
def inventory():
    items = client().inventory(game_id())
    picked = core.pick_items(items)
    return jsonify(
        items=items,
        to_sell=[i["asset_id"] for i in picked],
        to_sell_total=round(sum(float(i["price"]) for i in picked), 2),
    )


@app.get("/limits")
@auth
def limits():
    return jsonify(client().instant_payout())


@app.get("/offer/active")
@auth
def offer_active():
    return jsonify(offer=client().active_offer())


@app.get("/offer/<int:offer_id>")
@auth
def offer(offer_id):
    return jsonify(client().offer(offer_id))


@app.post("/sell")
@auth
def sell():
    body = request.get_json(silent=True) or {}
    gid = game_id()
    dry = bool(body.get("dry_run", core.DRY_RUN))
    lis = client()

    if lis.active_offer():
        return jsonify(error="faol sotuv bor, u tugashini kuting"), 409

    inv = lis.inventory(gid)
    wanted = body.get("asset_ids")
    if wanted:
        wanted = {str(x) for x in wanted}
        items = [i for i in inv if i["asset_id"] in wanted and not i.get("disabled_reason")]
    else:
        items = core.pick_items(inv)
    if not items:
        return jsonify(error="sotish uchun mos skin yo'q"), 400

    total = round(sum(float(i["price"]) for i in items), 2)
    instant = bool(body.get("instant", core.INSTANT_PAYOUT))
    if instant:
        ip = lis.instant_payout()
        rem = ip.get("sum_remaining")
        if rem is not None and total > float(rem):
            instant = False

    preview = dict(
        items=[{"asset_id": i["asset_id"], "name": i["name"], "price": i["price"]} for i in items],
        total=total, instant=instant, dry_run=dry,
    )
    if dry:
        return jsonify(preview)

    code, data = lis.create_offer(gid, [i["asset_id"] for i in items], total, instant,
                                  core.PAYMENT_GROUP_ID, core.EMAIL)
    if code not in (200, 201):
        return jsonify(error="lis xatosi", status=code, details=data), 502

    o = data.get("data", {})
    if core.STEAM_AUTO_CONFIRM and o.get("steam_trade_offer_id"):
        try:
            time.sleep(5)
            core.steam_accept(o["steam_trade_offer_id"])
            o["auto_confirmed"] = True
        except Exception as e:
            o["auto_confirm_error"] = str(e)
    return jsonify(preview | {"offer": o}), 201


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
