import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, FileText, Wrench, ClipboardList, LogOut, HardHat,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const groups = [
  {
    label: "Visão geral",
    items: [{ title: "Início", url: "/", icon: LayoutDashboard }],
  },
  {
    label: "Cadastros",
    items: [
      { title: "Clientes", url: "/clientes", icon: Users },
      { title: "Equipamentos", url: "/equipamentos", icon: Wrench },
      { title: "Contratos", url: "/contratos", icon: FileText },
    ],
  },
  {
    label: "Operação",
    items: [
      { title: "Medições", url: "/medicoes", icon: ClipboardList },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const collapsed = state === "collapsed";
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <HardHat className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-sidebar-foreground">MedControl</span>
              <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
                Gestão de Medições
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            {!collapsed && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <NavLink to={item.url} end={item.url === "/"}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        {!collapsed ? (
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-sidebar-foreground">{user?.email}</p>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent" onClick={signOut} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button size="icon" variant="ghost" className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent" onClick={signOut} title="Sair">
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
