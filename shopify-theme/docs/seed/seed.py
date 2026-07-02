#!/usr/bin/env python3
# Generates productSet variable files for the 6 BlitzSpirit products.
import json, os

BASE = "https://blitzspirit.vercel.app/assets/"
OUT = os.path.dirname(os.path.abspath(__file__))

def rt(paras):
    """Build Shopify rich_text_field JSON from list of paragraphs.
    Each paragraph is a list of (text, bold) runs."""
    children = []
    for runs in paras:
        kids = []
        for text, bold in runs:
            node = {"type": "text", "value": text}
            if bold:
                node["bold"] = True
            kids.append(node)
        children.append({"type": "paragraph", "children": kids})
    return json.dumps({"type": "root", "children": children}, ensure_ascii=False)

def html(paras):
    out = []
    for runs in paras:
        seg = "".join((f"<strong>{t}</strong>" if b else t) for t, b in runs)
        out.append(f"<p>{seg}</p>")
    return "".join(out)

CCODE = {"Black": "BLK", "Off-White": "OWH", "Navy": "NVY", "Stone": "STN"}

PRODUCTS = [
 {"handle":"the-boudica","title":"The Boudica","price":"28.00","type":"T-Shirt","code":"BOUD",
  "issue":"ISSUE_001","index_ref":"#01","limited":False,
  "strapline":"mono print. She doesn't ask. She doesn't explain.",
  "colours":[("Off-White","tee-boudica-offwhite.jpg"),("Black","tee-boudica-black.jpg")],
  "sizes":["S","M","L","XL","XXL"],
  "dossier":[
    [("Britannia reimagined: trident in hand, Union Jack shield raised, looking at no one in particular because she doesn't need to. She's already won and hasn't decided to let you know yet.",False)],
    [("Not a warrior queen for ceremony. Not a mascot. Not a tribute act. ",False),("The original. The standard. The one they built the statue to and still got wrong",True),(".",False)],
    [("220gsm heavyweight cotton. Screen printed in Britain. Wash inside out at 30°C. No tumble dry.",True)],
  ]},
 {"handle":"the-establishment","title":"The Establishment","price":"28.00","type":"T-Shirt","code":"ESTB",
  "issue":"ISSUE_000","index_ref":"LIMITED EDITION","limited":True,
  "strapline":"colour print. The old guard in full regalia.",
  "colours":[("Black","tee-skull-black-colour.jpg")],
  "sizes":["S","M","L","XL"],
  "dossier":[
    [("The bowler hat draped in Union Jack. The umbrella crossed like a weapon. The skull wearing it all with a grin that says: ",False),("I was here before you and I'll be here after",True),(".",False)],
    [("Colour print on OXY_BLACK. This is Issue 000 — before the archive started, when it was just one image and a name that hadn't been earned yet.",False)],
    [("220gsm heavyweight cotton. Colour screen printed in Britain. Wash inside out at 30°C. No tumble dry.",True)],
  ]},
 {"handle":"the-roll-call","title":"The Roll Call","price":"26.00","type":"T-Shirt","code":"ROLL",
  "issue":"ISSUE_001","index_ref":"#03","limited":False,
  "strapline":"answer your name.",
  "colours":[("Off-White","tee-tommy-white.jpg"),("Black","tee-tommy-black.jpg")],
  "sizes":["S","M","L","XL"],
  "dossier":[
    [("TOMMY",True),(" — every lad who shouldered a pack and went. ",False),("KATIE",True),(" — every woman who ran the switchboards, drove the ambulances and built the bombers. ",False),("WINSTON",True),(" — the growl on the wireless when it mattered most. ",False),("BOUDICA",True),(" — the one who started it all.",False)],
    [("Set like a band line-up, because that's what they are: the greatest line-up these islands ever fielded. Soft-hand typographic print. If you know, you know — and if someone asks, you get to tell the whole story.",False)],
    [("220gsm heavyweight cotton. Printed in Britain. Wash inside out at 30°C. No tumble dry.",True)],
  ]},
 {"handle":"the-frequency","title":"The Frequency","price":"28.00","type":"T-Shirt","code":"FREQ",
  "issue":"ISSUE_001","index_ref":"#04","limited":False,
  "strapline":"a mod target with a second signal.",
  "colours":[("Black","tee-roundel-black.jpg"),("Off-White","tee-roundel-offwhite.jpg"),("Navy","tee-roundel-navy.jpg")],
  "sizes":["S","M","L","XL"],
  "dossier":[
    [("From a distance: classic RAF roundel. Up close: every concentric ring is built entirely from the word ",False),("BLITZSPIRIT",True),(", repeated as a drumbeat. No extra logo. No signature. Just the brand, in the brand.",False)],
    [("Roundel started on the wings of Spitfires over Kent in 1940. A generation later the mods lifted it onto parkas and scooters. Same circle, same defiance — better tailoring.",False)],
    [("220gsm heavyweight cotton. Screen printed in Britain. Wash inside out at 30°C. No tumble dry.",True)],
  ]},
 {"handle":"the-clerk","title":"The Clerk","price":"28.00","type":"T-Shirt","code":"CLRK",
  "issue":"ISSUE_001","index_ref":"#05","limited":False,
  "strapline":"mono print. Courtesy is not weakness.",
  "colours":[("Black","tee-clerk-black.jpg"),("Off-White","tee-clerk-white.jpg")],
  "sizes":["S","M","L","XL"],
  "dossier":[
    [("The bowler hat and the umbrella: the most polite uniform ever invented. The man who wore it queued properly, apologised when you stepped on ",False),("his",True),(" foot — and walked to work through rubble with the morning paper under his arm, daring the Luftwaffe to make him late.",False)],
    [("Cross the brollies like cutlasses, put the skull under the brim, and you get the truth of him. The Jolly Roger of good manners — ",False),("politely menacing since the Blitz",True),(".",False)],
    [("220gsm heavyweight cotton. Screen printed in Britain. Wash inside out at 30°C. No tumble dry.",True)],
  ]},
 {"handle":"the-cap","title":"The Cap","price":"22.00","type":"Headwear","code":"CAP",
  "issue":"ISSUE_001","index_ref":"EQUIPMENT","limited":False,
  "strapline":"stiff upper brim.",
  "colours":[("Black","cap-black.jpg"),("Navy","cap-navy.jpg"),("Stone","cap-cream.jpg")],
  "sizes":None,
  "dossier":[
    [("Six-panel structured cap. BlitzSpirit embroidered on the front — ",False),("no typographic cowardice",True),(". Adjustable strap at the rear. Built for all weather, all latitudes, all situations where you'd rather say nothing and let the cap do the talking.",False)],
    [("Equipment division. Same principles as the tees — utility over decoration, quality over novelty.",False)],
    [("100% cotton twill. Embroidered logo. Adjustable strap. Spot clean.",True)],
  ]},
]

manifest = []
for p in PRODUCTS:
    colour_names = [c for c, _ in p["colours"]]
    url = {c: BASE + f for c, f in p["colours"]}
    options = [{"name": "Colour", "position": 1, "values": [{"name": c} for c in colour_names]}]
    if p["sizes"]:
        options.append({"name": "Size", "position": 2, "values": [{"name": s} for s in p["sizes"]]})
    files = [{"originalSource": url[c], "contentType": "IMAGE",
              "alt": f'{p["title"]} — {c}'} for c in colour_names]
    variants = []
    sizes = p["sizes"] if p["sizes"] else [None]
    for c in colour_names:
        for s in sizes:
            ov = [{"optionName": "Colour", "name": c}]
            sku = f'BS-{p["code"]}-{CCODE[c]}'
            if s is not None:
                ov.append({"optionName": "Size", "name": s})
                sku += f"-{s}"
            variants.append({
                "optionValues": ov,
                "price": p["price"],
                "inventoryItem": {"tracked": True, "sku": sku},
                "inventoryPolicy": "CONTINUE",
                "file": {"originalSource": url[c]},
            })
    metafields = [
        {"namespace": "custom", "key": "strapline", "type": "single_line_text_field", "value": p["strapline"]},
        {"namespace": "custom", "key": "issue", "type": "single_line_text_field", "value": p["issue"]},
        {"namespace": "custom", "key": "index_ref", "type": "single_line_text_field", "value": p["index_ref"]},
        {"namespace": "custom", "key": "limited", "type": "boolean", "value": "true" if p["limited"] else "false"},
        {"namespace": "custom", "key": "dossier", "type": "rich_text_field", "value": rt(p["dossier"])},
    ]
    tags = [p["issue"]]
    if p["limited"]:
        tags.append("limited")
    inp = {
        "input": {
            "title": p["title"],
            "handle": p["handle"],
            "descriptionHtml": html(p["dossier"]),
            "productType": p["type"],
            "vendor": "BlitzSpirit",
            "status": "DRAFT",
            "tags": tags,
            "productOptions": options,
            "files": files,
            "variants": variants,
            "metafields": metafields,
        }
    }
    fn = os.path.join(OUT, f'vars_{p["handle"]}.json')
    with open(fn, "w", encoding="utf-8") as fh:
        json.dump(inp, fh, ensure_ascii=False)
    manifest.append((p["handle"], len(variants), len(colour_names)))

print(json.dumps(manifest))
