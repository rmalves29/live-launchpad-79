import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Download, Search, Archive, PlayCircle } from "lucide-react";

type ArchiveFile = {
  id: string;
  source_table: string;
  storage_path: string;
  period_start: string;
  period_end: string;
  row_count: number;
  size_bytes: number;
  compressed_size_bytes: number;
  status: string;
  created_at: string;
};

const TABLES = [
  { value: "all", label: "Todas" },
  { value: "webhook_logs", label: "webhook_logs (pagamentos)" },
  { value: "fe_group_events", label: "fe_group_events (grupos WhatsApp)" },
];

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default function ArquivoHistorico() {
  const [files, setFiles] = useState<ArchiveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [table, setTable] = useState("all");
  const [search, setSearch] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("archive_files")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (table !== "all") q = q.eq("source_table", table);
    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    } else {
      setFiles((data ?? []) as ArchiveFile[]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [table]);

  const filtered = useMemo(() => {
    if (!search.trim()) return files;
    const s = search.toLowerCase();
    return files.filter((f) =>
      f.storage_path.toLowerCase().includes(s) ||
      f.source_table.toLowerCase().includes(s)
    );
  }, [files, search]);

  async function handleDownload(f: ArchiveFile) {
    setDownloadingId(f.id);
    try {
      const { data, error } = await supabase.storage
        .from("archives")
        .createSignedUrl(f.storage_path, 300);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (e: any) {
      toast({ title: "Falha ao gerar link", description: e.message, variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  }

  async function runArchive(tableName: string) {
    setRunning(tableName);
    try {
      const { data, error } = await supabase.functions.invoke("archive-and-cleanup", {
        body: { table: tableName, retention_days: tableName === "webhook_logs" ? 30 : 90 },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Falha desconhecida");
      toast({
        title: "Arquivamento concluído",
        description: `Exportados: ${data.total_exported} · Deletados: ${data.total_deleted} · Restantes: ${data.remaining_rows}`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Erro no arquivamento", description: e.message, variant: "destructive" });
    } finally {
      setRunning(null);
    }
  }

  const totals = useMemo(() => {
    const t = { files: filtered.length, rows: 0, compressed: 0, raw: 0 };
    for (const f of filtered) {
      t.rows += f.row_count;
      t.compressed += f.compressed_size_bytes;
      t.raw += f.size_bytes;
    }
    return t;
  }, [filtered]);

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-[1600px]">
      <div className="flex items-center gap-3">
        <Archive className="w-6 h-6" />
        <div>
          <h1 className="text-2xl font-bold">Arquivo Histórico</h1>
          <p className="text-sm text-muted-foreground">
            Registros arquivados no Supabase Storage antes da limpeza automática. Consulta e download preservados para sempre.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Arquivos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totals.files}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Linhas arquivadas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totals.rows.toLocaleString("pt-BR")}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Tamanho comprimido</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatBytes(totals.compressed)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Tamanho original</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatBytes(totals.raw)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Executar arquivamento manual</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => runArchive("webhook_logs")} disabled={running !== null}>
            {running === "webhook_logs" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            Arquivar webhook_logs (&gt;30d)
          </Button>
          <Button onClick={() => runArchive("fe_group_events")} disabled={running !== null} variant="secondary">
            {running === "fe_group_events" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            Arquivar fe_group_events (&gt;90d)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle>Arquivos disponíveis</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Select value={table} onValueChange={setTable}>
              <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TABLES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por caminho..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-[260px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">Nenhum arquivo encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tabela</TableHead>
                    <TableHead>Período coberto</TableHead>
                    <TableHead className="text-right">Linhas</TableHead>
                    <TableHead className="text-right">Tamanho</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(f.created_at)}</TableCell>
                      <TableCell><Badge variant="outline">{f.source_table}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(f.period_start)}<br/>→ {formatDate(f.period_end)}
                      </TableCell>
                      <TableCell className="text-right">{f.row_count.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right text-sm">
                        {formatBytes(f.compressed_size_bytes)}
                        <div className="text-xs text-muted-foreground">de {formatBytes(f.size_bytes)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={f.status === "completed" ? "default" : f.status === "error" ? "destructive" : "secondary"}>
                          {f.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(f)}
                          disabled={downloadingId === f.id || f.status !== "completed"}
                        >
                          {downloadingId === f.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Como consultar o conteúdo</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Cada arquivo é um <code>.jsonl.gz</code> (JSON por linha, comprimido com gzip).</p>
          <p>Para inspecionar localmente após o download:</p>
          <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">gunzip -c arquivo.jsonl.gz | jq 'select(.tenant_id == "SEU_TENANT_ID")'</pre>
        </CardContent>
      </Card>
    </div>
  );
}
