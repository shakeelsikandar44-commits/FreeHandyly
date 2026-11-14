"""Exchange-rate proxy used by the Currency & Crypto Converter (served at /api/rates).

Fiat rates come from the free @fawazahmed0/currency-api dataset (USD base), which is published once a day. Crypto prices are
refreshed about every two minutes from Coinbase's public price feed; if that feed is unavailable the daily dataset's crypto
values are used instead (and the response says so through "crypto_updated"). Everything is cached in memory and
the last good copy is served (flagged "stale") if the upstream is briefly unavailable. The tool's JavaScript falls back to
fetching the same public sources straight from the browser if this endpoint ever fails."""
import json
import threading
import time
import urllib.request

SOURCES = [
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    "https://latest.currency-api.pages.dev/v1/currencies/usd.json",
]
CODES = ("AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP "
         "CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR "
         "IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK "
         "MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLL SOS "
         "SRD SSP STN SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWL").split()
CRYPTO = "BTC ETH USDT BNB SOL XRP DOGE LTC ADA TRX USDC DOT".split()
TTL = 3600
_lock = threading.Lock()
_cache = {"data": None, "at": 0.0}


def _download():
    last = None
    for url in SOURCES:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "FreeHandyly/1.0"}), timeout=8) as r:
                j = json.loads(r.read().decode("utf-8"))
            usd = j.get("usd") or {}
            fiat = {"USD": 1}
            for code in CODES:
                v = usd.get(code.lower())
                if isinstance(v, (int, float)) and v > 0:
                    fiat[code] = v
            crypto = {}
            for code in CRYPTO:
                v = usd.get(code.lower())
                if isinstance(v, (int, float)) and v > 0:
                    crypto[code] = 1 / v
            if len(fiat) >= 5:
                day = str(j.get("date") or "")
                return {"fiat": fiat, "crypto": crypto, "fiat_updated": day, "crypto_updated": day, "source": "currency-api"}
        except Exception as exc:  # noqa: BLE001 - try the next source
            last = exc
    raise RuntimeError("no rate source available: %r" % (last,))


def _get_base():
    """Returns (data, ok). Raises RuntimeError only when there is neither fresh nor cached data."""
    with _lock:
        now = time.time()
        if _cache["data"] and now - _cache["at"] < TTL:
            return _cache["data"]
        try:
            _cache["data"], _cache["at"] = _download(), now
            return _cache["data"]
        except RuntimeError:
            if _cache["data"]:
                return dict(_cache["data"], stale=True)
            raise


LIVE_URL = "https://api.coinbase.com/v2/exchange-rates?currency=USD"   # public, no API key; units of each asset per 1 USD
LIVE_TTL = 120
LIVE_KEEP = 900          # keep serving the last good live copy for up to 15 minutes if the feed fails
_live = {"data": {}, "at": 0.0, "stamp": ""}


def _download_live():
    req = urllib.request.Request(LIVE_URL, headers={"User-Agent": "FreeHandyly/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=6) as r:
        rates = ((json.loads(r.read().decode("utf-8")) or {}).get("data") or {}).get("rates") or {}
    out = {}
    for code in CRYPTO:
        try:
            v = float(rates.get(code) or 0)
        except (TypeError, ValueError):
            v = 0.0
        if v > 0:
            out[code] = 1 / v            # USD price of one coin
    return out


def _live_crypto():
    """Returns ({code: usd_price}, "YYYY-MM-DD HH:MM UTC") or ({}, "") when no recent live data exists."""
    with _lock:
        now = time.time()
        if _live["data"] and now - _live["at"] < LIVE_TTL:
            return _live["data"], _live["stamp"]
        try:
            data = _download_live()
        except Exception:  # noqa: BLE001 - the daily dataset is the fallback
            data = {}
        if data:
            _live.update(data=data, at=now, stamp=time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(now)))
            return data, _live["stamp"]
        if _live["data"] and now - _live["at"] < LIVE_KEEP:
            return _live["data"], _live["stamp"]
        return {}, ""


def get_rates():
    base = _get_base()
    live, stamp = _live_crypto()
    if len(live) < 5:        # too little to trust: keep the daily values for every coin
        return base
    out = dict(base)
    out["crypto"] = dict(base.get("crypto") or {}, **live)
    out["crypto_updated"] = stamp
    out["source"] = (base.get("source") or "currency-api") + " + Coinbase (crypto)"
    return out
