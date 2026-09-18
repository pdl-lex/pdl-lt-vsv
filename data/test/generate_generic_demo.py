#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Zweiter Demo-Datensatz im IDENTISCHEN Schema, voellig andere Domaene und
Facette ('korpus' statt 'publication'). Zeigt: das Tool ist domaenenagnostisch."""
import json, numpy as np
RNG = np.random.default_rng(7); D = 32

clusters = {
    "POSITIVE": ["excellent","brilliant","delight","masterpiece","superb"],
    "NEGATIVE": ["dreadful","flop","disaster","tedious","clumsy"],
    "TECH":     ["algorithm","interface","hardware","protocol","dataset"],
    "NEUTRAL":  ["report","summary","overview","context","baseline"],
}
def unit(): 
    v=RNG.standard_normal(D); return v/np.linalg.norm(v)
cent={c:unit() for c in clusters}
anchors=[]
for c,ws in clusters.items():
    for w in ws:
        v=cent[c]+0.12*unit(); anchors.append({"label":w,"cluster":c,"vector":v/np.linalg.norm(v)})

slices=[{"id":str(y),"label":str(y),"start":f"{y}-01-01","index":i,"year":y}
        for i,y in enumerate(range(2013,2025))]
def tt(s): return s["year"]-2013
def logi(t,c,k=1.2): return 1/(1+np.exp(-k*(t-c)))

# Facette "korpus" (Textsorten) mit eigenem Verschiebungsprofil
korpora={"reviews":{"label":"User Reviews","dt":0.0,"amp":1.0},
         "press":{"label":"Press","dt":0.8,"amp":0.8},
         "academic":{"label":"Academic","dt":1.5,"amp":0.6}}

def traj_cloud(t):     # "cloud": neutral/tech -> stark positiv (Reifung)
    s=logi(t,5.0)
    return {"TECH":0.6*(1-s)+0.1,"POSITIVE":0.1+0.6*s,"NEUTRAL":0.2}, -0.1+0.6*s, 200+300*s
def traj_bug(t):       # "bug": bleibt negativ, Frequenz schwankt
    return {"NEGATIVE":0.6,"TECH":0.3,"NEUTRAL":0.1}, -0.55+0.05*np.sin(t), 150+40*np.sin(t*1.3)
def traj_agile(t):     # "agile": neutral -> positiv dann leicht zurueck (Hype-Zyklus)
    s=logi(t,3.0); d=np.exp(-0.2*np.clip(t-6,0,None))
    return {"NEUTRAL":0.4,"POSITIVE":0.2+0.4*s*d,"TECH":0.4}, 0.1+0.4*s*d, 80+220*s*d
targets={"cloud":("Cloud",traj_cloud),"bug":("Bug",traj_bug),"agile":("Agile",traj_agile)}

def mix_vec(m,noise=0.06):
    v=sum(w*cent[c] for c,w in m.items())+noise*unit(); return v/np.linalg.norm(v)

records=[]; aggregates=[]
for wid,(lbl,fn) in targets.items():
    for s in slices:
        t=tt(s); pv=[]; pw=[]
        for kid,k in korpora.items():
            m,sent,fb=fn(t-k["dt"]); sent=float(np.clip(sent*k["amp"],-1,1))
            freq=int(RNG.poisson(max(0,fb))); v=mix_vec(m)
            records.append({"entity_id":wid,"time_slice_id":s["id"],
                            "facets":{"korpus":kid},"vector":v,"freq":freq,"sentiment":sent})
            if freq>0: pv.append(v*freq); pw.append(freq)
        agg=(np.sum(pv,axis=0)/np.sum(pw)) if pw else mix_vec(fn(t)[0])
        agg=agg/(np.linalg.norm(agg) or 1)
        last=records[-len(korpora):]
        aggregates.append({"entity_id":wid,"time_slice_id":s["id"],"facets":{},
            "vector":agg,"freq":int(sum(max(r["freq"],0) for r in last)),
            "sentiment":float(np.average([r["sentiment"] for r in last],
                              weights=[max(r["freq"],0)+1e-6 for r in last]))})

allv=[a["vector"] for a in anchors]+[r["vector"] for r in aggregates]+[r["vector"] for r in records]
X=np.vstack(allv); mu=X.mean(0); U,S,Vt=np.linalg.svd(X-mu,full_matrices=False); PC=Vt[:3]
proj=lambda v:((np.asarray(v)-mu)@PC.T)
for coll in (anchors,aggregates,records):
    for r in coll:
        r["coords_3d"]=[round(float(x),4) for x in proj(r["vector"])]
        r["vector"]=[round(float(x),5) for x in r["vector"]]

def cos(a,b):
    a=np.asarray(a);b=np.asarray(b);return float(a@b/((np.linalg.norm(a)*np.linalg.norm(b))or 1))
aggby={(r["entity_id"],r["time_slice_id"]):r for r in aggregates}
neighbors={}
for wid in targets:
    neighbors[wid]={}
    for s in slices:
        base=aggby[(wid,s["id"])]["vector"]
        cc=[(a["label"],cos(base,a["vector"]),a["cluster"]) for a in anchors]
        cc.sort(key=lambda x:-x[1])
        neighbors[wid][s["id"]]=[{"label":l,"score":round(v,4),"group":g} for l,v,g in cc[:6]]

bundle={"meta":{"name":"Tech-Diskurs (synthetisch, generisch)",
    "description":"Zweiter Demo-Datensatz, andere Domaene + Facette 'korpus'. "
                  "Belegt Domaenenunabhaengigkeit des Schemas.","vector_dim":D,
    "projection":"joint PCA (3 Komponenten)","shift_point":None},
  "facets_schema":[{"id":"korpus","label":"Korpus","type":"categorical",
      "values":[{"id":k,"label":v["label"]} for k,v in korpora.items()]}],
  "entities":[{"id":w,"label":l,"category":"Demo","note":""} for w,(l,_) in targets.items()],
  "time_slices":slices,"anchors":anchors,"records":records,
  "aggregates":aggregates,"neighbors":neighbors}
json.dump(bundle,open("/home/claude/generic_demo.json","w"),ensure_ascii=False)
print("generic_demo.json:",len(records),"records,",len(anchors),"anchors")
