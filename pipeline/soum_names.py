"""Soum names in Mongolian Cyrillic, written into data/soums.geojson as name_mn and aimag_mn.

The boundary source gives romanised names only (x = х, c = ц, u' = ү, o' = ө) and the apostrophe is often dropped after
the first vowel, so vowel harmony has to restore it. Compound names reset the harmony at the start of a back-vowel word.
This is a conversion, not an official list: the exceptions below were checked by eye, but a spelling may still be off.

    python soum_names.py
"""
import json
import os
import re

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "soums.geojson")

AIMAG = {
    "Arkhangai": "Архангай", "Bayan-Ölgii": "Баян-Өлгий", "Bayankhongor": "Баянхонгор", "Bulgan": "Булган", "Darkhan-Uul": "Дархан-Уул",
    "Dornod": "Дорнод", "Dornogovi": "Дорноговь", "Dundgovi": "Дундговь", "Govi-Altai": "Говь-Алтай", "Govisumber": "Говьсүмбэр",
    "Hovsgel": "Хөвсгөл", "Khentii": "Хэнтий", "Khovd": "Ховд", "Orkhon": "Орхон", "Selenge": "Сэлэнгэ", "Sükhbaatar": "Сүхбаатар",
    "Töv": "Төв", "Ulaanbaatar": "Улаанбаатар", "Uvs": "Увс", "Zavkhan": "Завхан", "Ömnögovi": "Өмнөговь", "Övörkhangai": "Өвөрхангай",
}

# Names the rules cannot reach: source spelling, soft signs, spaces in compound names.
EXACT = {
    "Galshir": "Галшар", "Darvi": "Дарви", "Sharyngol": "Шарынгол", "Bor-Ondor": "Бор-Өндөр", "Cogt-Cecii": "Цогт-Цэций", "Ulaan uul": "Улаан-Уул",
    "Zamyn U'ud": "Замын-Үүд", "Xalx gol": "Халхгол", "Bayan agt": "Баянагт", "Ix xet": "Иххэт", "Guchin-Us": "Гучин-Ус", "Xerlen": "Хэрлэн", "Herlen": "Хэрлэн",
    "Batshireet": "Батширээт", "Batsu'mber": "Батсүмбэр", "Bayan-O'njuul": "Баян-Өнжүүл", "Yeso'nzu'il": "Есөнзүйл", "Xo'vsgol": "Хөвсгөл",
    "Cagaan-U'ur": "Цагаан-Үүр", "Saintsagaan": "Сайнцагаан", "Tonkhil": "Тонхил", "Luus": "Луус", "Mo'ngonmorit": "Мөнгөнморьт", "Xo'xmorit": "Хөхморьт",
}

# Words after which back vowels stand again, even if a front vowel came before.
BACK_WORDS = ("cogt", "togtox", "ovoo", "bogd", "govi", "gol", "nuur", "bulag", "bulgan", "uul", "sant", "dalai", "mandal", "cagaan", "bayan", "xangai", "xairxan", "ulaan", "xaan", "saixan", "chuluut", "ugtaal")
PAIRS = [("o'", "ө"), ("u'", "ү"), ("ch", "ч"), ("sh", "ш"), ("ts", "ц"), ("kh", "х"), ("ya", "я"), ("yo", "ё"), ("ye", "е"), ("ai", "ай"), ("oi", "ой"), ("ui", "уй"), ("ei", "эй"), ("ii", "ий")]
ONE = dict(a="а", b="б", c="ц", d="д", e="э", g="г", h="х", i="и", j="ж", k="к", l="л", m="м", n="н", o="о", r="р", s="с", t="т", u="у", v="в", x="х", y="й", z="з")


def word(w):
    w = w.lower()
    out, i, front = [], 0, False
    while i < len(w):
        if i and any(w.startswith(b, i) for b in BACK_WORDS):
            front = False
        for a, b in PAIRS:
            if w.startswith(a, i):
                out.append(b)
                i += len(a)
                break
        else:
            ch = w[i]
            c = ONE.get(ch, ch)
            if front and c == "о":
                c = "ө"
            if front and c == "у":
                c = "ү"
            out.append(c)
            i += 1
        if out[-1][0] in "өүэе":
            front = True
        elif out[-1][0] in "ая":
            front = False
    return "".join(out)


def convert(name):
    if name in EXACT:
        return EXACT[name]
    parts = re.split(r"([- ])", name)
    res = "".join(p if p in "- " else word(p) for p in parts)
    res = re.sub(r"гови(?=$|-)", "говь", res)
    res = re.sub(r"мани(?=$|-)", "мань", res)
    return "-".join(s[:1].upper() + s[1:] for s in res.split("-"))


def main():
    gj = json.load(open(PATH, encoding="utf-8"))
    for f in gj["features"]:
        p = f["properties"]
        p["name_mn"] = convert(p["name"])
        p["aimag_mn"] = AIMAG[p["aimag"]]
    json.dump(gj, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    return gj


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    g = main()
    print(" | ".join(sorted({f["properties"]["name_mn"] for f in g["features"]})))
