import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Search, Zap, X } from 'lucide-react';

type Product = { id:number; code:string|null; name:string; price:number|null; promotional_price:number|null; image_url:string|null; stock:number|null };
const money=(v:number)=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function LiveProductPin(){
 const {tenant}=useTenant(); const [q,setQ]=useState(''); const [products,setProducts]=useState<Product[]>([]); const [selected,setSelected]=useState<Product|null>(null); const [discount,setDiscount]=useState(20); const [minutes,setMinutes]=useState(10); const [seconds,setSeconds]=useState(600); const [visible,setVisible]=useState(false);
 useEffect(()=>{ if(!tenant?.id)return; supabase.from('products').select('id,code,name,price,promotional_price,image_url,stock').eq('tenant_id',tenant.id).eq('is_active',true).gt('stock',0).limit(100).then(({data})=>setProducts((data as Product[])||[])); },[tenant?.id]);
 useEffect(()=>{if(!visible)return; const t=setInterval(()=>setSeconds(s=>Math.max(0,s-1)),1000);return()=>clearInterval(t)},[visible]);
 const filtered=useMemo(()=>products.filter(p=>(`${p.code||''} ${p.name}`).toLowerCase().includes(q.toLowerCase())).slice(0,12),[products,q]);
 const base=Number(selected?.promotional_price||selected?.price||0); const offer=Math.max(0,base*(1-discount/100)); const clock=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
 function show(){if(!selected)return toast({title:'Selecione um produto'});setSeconds(Math.max(1,minutes)*60);setVisible(true);toast({title:'Produto exibido na prévia',description:'Product Pin ativado para teste.'})}
 return <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
  <Card className="p-4 space-y-3"><div><h3 className="font-semibold">Product Pin da Live</h3><p className="text-xs text-muted-foreground">Teste visual do card de oferta sobre a transmissão. Selecione o produto, desconto e duração.</p></div>
   <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Buscar produto ou código" value={q} onChange={e=>setQ(e.target.value)}/></div>
   <div className="max-h-72 overflow-auto rounded-lg border divide-y">{filtered.map(p=><button key={p.id} className={`w-full p-2 flex gap-3 text-left hover:bg-muted/50 ${selected?.id===p.id?'bg-muted':''}`} onClick={()=>setSelected(p)}>{p.image_url?<img src={p.image_url} className="h-12 w-12 rounded object-cover"/>:<div className="h-12 w-12 rounded bg-muted"/>}<div className="min-w-0"><div className="font-medium truncate">{p.name}</div><div className="text-xs text-muted-foreground">{p.code} · {money(Number(p.promotional_price||p.price||0))} · estoque {p.stock||0}</div></div></button>)}</div>
   <div className="grid grid-cols-2 gap-3"><div><Label>Desconto (%)</Label><Input type="number" min={0} max={90} value={discount} onChange={e=>setDiscount(Math.min(90,Math.max(0,Number(e.target.value)||0)))}/></div><div><Label>Contador (min)</Label><Input type="number" min={1} max={180} value={minutes} onChange={e=>setMinutes(Math.min(180,Math.max(1,Number(e.target.value)||1)))}/></div></div>
   <div className="flex gap-2"><Button onClick={show} disabled={!selected}><Zap className="h-4 w-4 mr-1"/>Exibir na live</Button><Button variant="outline" onClick={()=>setVisible(false)} disabled={!visible}>Remover</Button></div>
  </Card>
  <div><div className="mb-2 text-sm font-medium">Prévia 9:16</div><div className="relative mx-auto aspect-[9/16] max-h-[640px] overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-700 to-zinc-950 shadow-xl"><div className="absolute inset-0 flex items-center justify-center text-center text-white/50 text-sm px-8">Prévia da câmera / transmissão Instagram</div>{visible&&selected&&<div className="absolute bottom-5 left-3 right-3 rounded-xl bg-white p-2.5 shadow-2xl text-zinc-950"><button className="absolute right-2 top-2 text-zinc-400" onClick={()=>setVisible(false)}><X className="h-4 w-4"/></button><div className="flex gap-2.5">{selected.image_url?<img src={selected.image_url} className="h-20 w-20 rounded-lg object-cover"/>:<div className="h-20 w-20 rounded-lg bg-zinc-100"/>}<div className="min-w-0 flex-1"><div className="truncate pr-5 text-sm font-semibold">{selected.name}</div><div className="mt-1 flex flex-wrap gap-1"><Badge className="bg-orange-500 hover:bg-orange-500"><Zap className="h-3 w-3 mr-1"/>Oferta Relâmpago {clock}</Badge><Badge variant="secondary">Estoque {selected.stock||0}</Badge></div><div className="mt-1.5 flex items-end gap-1.5"><b className="text-lg">{money(offer)}</b>{discount>0&&<><span className="text-xs text-zinc-400 line-through">{money(base)}</span><span className="text-xs text-rose-500">(-{discount}%)</span></>}</div></div></div><div className="mt-2 flex items-center justify-between"><span className="text-xs text-zinc-500">{selected.code?`Código ${selected.code}`:'Oferta exclusiva da live'}</span><span className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white">Comprar</span></div></div>}</div></div>
 </div>
}
