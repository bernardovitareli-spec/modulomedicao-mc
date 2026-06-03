import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fmtDate } from "@/lib/format";
import { usePermissions, ROLE_LABELS, AppRole } from "@/lib/permissions";
import { Navigate } from "react-router-dom";
import { Check, X, Users as UsersIcon } from "lucide-react";
import {
  useUsuariosAtivos, useUsuariosPendentes, useUsuarioVinculos,
  useAprovarUsuario, useRejeitarUsuario, useDefinirRole, useEditarVinculosCliente,
} from "@/data/usuarios";
import { useClientesAtivos } from "@/data/clientes";
import { TableSkeleton } from "@/components/skeletons";

type Pendente = { user_id: string; email: string; solicitado_em: string };

export default function Usuarios() {
  const { canManageUsers } = usePermissions();
  const { data: users = [], isLoading: loadingUsers } = useUsuariosAtivos();
  const { data: pendentes = [], isLoading: loadingPend } = useUsuariosPendentes();
  const { data: clientes = [] } = useClientesAtivos();

  const aprovar = useAprovarUsuario();
  const rejeitar = useRejeitarUsuario();
  const definirRole = useDefinirRole();
  const editarVinc = useEditarVinculosCliente();

  // Aprovar dialog
  const [aprovOpen, setAprovOpen] = useState(false);
  const [aprovUser, setAprovUser] = useState<Pendente | null>(null);
  const [aprovRole, setAprovRole] = useState<AppRole>("visualizacao");
  const [aprovClientes, setAprovClientes] = useState<string[]>([]);

  // Rejeitar dialog
  const [rejOpen, setRejOpen] = useState(false);
  const [rejUser, setRejUser] = useState<Pendente | null>(null);
  const [rejMotivo, setRejMotivo] = useState("");

  // Vínculos dialog
  const [vincOpen, setVincOpen] = useState(false);
  const [vincUser, setVincUser] = useState<any>(null);
  const [vincClientes, setVincClientes] = useState<string[]>([]);
  const { data: vincLoaded } = useUsuarioVinculos(vincOpen && vincUser?.user_id ? vincUser.user_id : undefined);

  useEffect(() => {
    if (vincOpen && vincLoaded) setVincClientes(vincLoaded);
  }, [vincOpen, vincLoaded]);

  if (!canManageUsers) return <Navigate to="/" replace />;

  const setRole = (uid: string, role: AppRole) => definirRole.mutate({ user_id: uid, role });

  const openAprovar = (p: Pendente) => {
    setAprovUser(p); setAprovRole("visualizacao"); setAprovClientes([]); setAprovOpen(true);
  };
  const confirmAprovar = async () => {
    if (!aprovUser) return;
    try {
      await aprovar.mutateAsync({ user_id: aprovUser.user_id, role: aprovRole, cliente_ids: aprovClientes });
      setAprovOpen(false);
    } catch { /* notify */ }
  };

  const openRejeitar = (p: Pendente) => { setRejUser(p); setRejMotivo(""); setRejOpen(true); };
  const confirmRejeitar = async () => {
    if (!rejUser) return;
    try {
      await rejeitar.mutateAsync({ user_id: rejUser.user_id, motivo: rejMotivo });
      setRejOpen(false);
    } catch { /* notify */ }
  };

  const openVinculos = (u: any) => { setVincUser(u); setVincClientes([]); setVincOpen(true); };
  const confirmVinculos = async () => {
    if (!vincUser) return;
    try {
      await editarVinc.mutateAsync({ user_id: vincUser.user_id, cliente_ids: vincClientes });
      setVincOpen(false);
    } catch { /* notify */ }
  };

  const toggleAprovCliente = (id: string) =>
    setAprovClientes((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  const toggleVincCliente = (id: string) =>
    setVincClientes((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);

  return (
    <div>
      <PageHeader title="Usuários e perfis" description="Gerencie aprovações de cadastro, perfis e vínculos por cliente" />

      <Tabs defaultValue="pendentes">
        <TabsList>
          <TabsTrigger value="pendentes">
            Pendentes de aprovação {pendentes.length > 0 && <Badge className="ml-2" variant="destructive">{pendentes.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="ativos">Usuários ativos</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes">
          <Card><CardContent className="p-4">
            {loadingPend ? <TableSkeleton cols={3} rows={4} /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Solicitado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {pendentes.length === 0 && <TableRow><TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">Nenhum cadastro pendente</TableCell></TableRow>}
                {pendentes.map((p: any) => (
                  <TableRow key={p.user_id}>
                    <TableCell className="font-medium">{p.email}</TableCell>
                    <TableCell className="num text-xs">{fmtDate(p.solicitado_em)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="default" onClick={() => openAprovar(p)} className="mr-2">
                        <Check className="mr-1 h-4 w-4" /> Aprovar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => openRejeitar(p)}>
                        <X className="mr-1 h-4 w-4" /> Rejeitar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ativos">
          <Card><CardContent className="p-4">
            {loadingUsers ? <TableSkeleton cols={5} rows={6} /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Cadastrado em</TableHead>
                <TableHead>Perfil atual</TableHead>
                <TableHead>Alterar perfil</TableHead>
                <TableHead>Clientes vinculados</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {users.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Nenhum usuário</TableCell></TableRow>}
                {users.map((u: any) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell className="num text-xs">{fmtDate(u.created_at)}</TableCell>
                    <TableCell><Badge variant={u.role === "admin" ? "default" : "outline"}>{ROLE_LABELS[u.role as AppRole] ?? "Sem perfil"}</Badge></TableCell>
                    <TableCell>
                      <Select value={u.role ?? ""} onValueChange={(v) => setRole(u.user_id, v as AppRole)}>
                        <SelectTrigger className="w-56"><SelectValue placeholder="Definir perfil" /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {u.role === "visualizacao" ? (
                        <Button size="sm" variant="outline" onClick={() => openVinculos(u)}>
                          <UsersIcon className="mr-1 h-4 w-4" /> Editar vínculos
                        </Button>
                      ) : <span className="text-xs text-muted-foreground">Todos (perfil interno)</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Aprovar */}
      <Dialog open={aprovOpen} onOpenChange={setAprovOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aprovar cadastro</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{aprovUser?.email}</p>
            <div>
              <Label>Perfil</Label>
              <Select value={aprovRole} onValueChange={(v) => setAprovRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {aprovRole === "visualizacao" && (
              <div>
                <Label>Clientes vinculados (obrigatório para perfil de visualização)</Label>
                <ScrollArea className="h-56 rounded border p-2">
                  {clientes.map((c: any) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                      <Checkbox checked={aprovClientes.includes(c.id)} onCheckedChange={() => toggleAprovCliente(c.id)} />
                      {c.razao_social}
                    </label>
                  ))}
                </ScrollArea>
                <p className="mt-1 text-xs text-muted-foreground">Selecionados: {aprovClientes.length}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAprovOpen(false)}>Cancelar</Button>
            <Button onClick={confirmAprovar} disabled={aprovar.isPending || (aprovRole === "visualizacao" && aprovClientes.length === 0)}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejeitar */}
      <Dialog open={rejOpen} onOpenChange={setRejOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rejeitar cadastro</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{rejUser?.email}</p>
            <p className="text-xs text-destructive">Esta ação remove o usuário definitivamente.</p>
            <div>
              <Label>Motivo *</Label>
              <Textarea value={rejMotivo} onChange={(e) => setRejMotivo(e.target.value)} rows={3} placeholder="Mínimo 3 caracteres" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmRejeitar} disabled={rejeitar.isPending || rejMotivo.trim().length < 3}>Rejeitar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vínculos */}
      <Dialog open={vincOpen} onOpenChange={setVincOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar clientes vinculados</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{vincUser?.email}</p>
            <ScrollArea className="h-72 rounded border p-2">
              {clientes.map((c: any) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
                  <Checkbox checked={vincClientes.includes(c.id)} onCheckedChange={() => toggleVincCliente(c.id)} />
                  {c.razao_social}
                </label>
              ))}
            </ScrollArea>
            <p className="text-xs text-muted-foreground">Selecionados: {vincClientes.length}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVincOpen(false)}>Cancelar</Button>
            <Button onClick={confirmVinculos} disabled={editarVinc.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
