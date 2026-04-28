import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { usePermissions, ROLE_LABELS, AppRole } from "@/lib/permissions";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";

export default function Usuarios() {
  const { canManageUsers } = usePermissions();
  const [users, setUsers] = useState<any[]>([]);

  const load = () => supabase.rpc("admin_list_users").then(({ data, error }) => {
    if (error) toast.error(error.message);
    else setUsers((data as any) ?? []);
  });

  useEffect(() => { if (canManageUsers) load(); }, [canManageUsers]);

  if (!canManageUsers) return <Navigate to="/" replace />;

  const setRole = async (uid: string, role: AppRole) => {
    const { error } = await supabase.rpc("admin_set_user_role", { _target_user: uid, _role: role });
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
    load();
  };

  return (
    <div>
      <PageHeader title="Usuários e perfis" description="Atribua o perfil de cada usuário do sistema" />
      <Card><CardContent className="p-4">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Cadastrado em</TableHead>
            <TableHead>Perfil atual</TableHead>
            <TableHead>Alterar perfil</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {users.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Carregando...</TableCell></TableRow>}
            {users.map((u) => (
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
