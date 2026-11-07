"""Exchange-rate proxy used by the Currency & Crypto Converter (served at /api/rates).

Rates come from the free @fawazahmed0/currency-api dataset (USD base, fiat + crypto), are cached in memory for an hour and
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


def get_rates():
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
