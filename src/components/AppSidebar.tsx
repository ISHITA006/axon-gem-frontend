import {
  Gem,
  Video,
  Images,
  Users,
  LogOut,
  Camera,
  ImagePlus,
  Upload,
  LibraryBig,
  UserCog,
  Wand2,
  Sparkles,
  PersonStanding,
  UserPen,
  Paintbrush,
  LucideCamera,
  SwitchCamera,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";

export type TabValue =
  | "tryon"
  | "shoot"
  | "colour"
  | "length"
  | "embroideryPrint"
  | "video"
  | "gallery"
  | "catalogue"
  | "uploadStudioShoot"
  | "models"
  | "poses"
  | "closeUpPoses"
  | "modelPoses"
  | "backgrounds"
  | "catalogViewerManagement"
  | "editImage"
  | "generateNewDesigns"
  | "brandKit";

const navItems: { title: string; value: TabValue; icon: React.ElementType }[] = [
  { title: "Studio Shoot", value: "uploadStudioShoot", icon: Camera },
  { title: "Brand Kit", value: "brandKit", icon: Palette },
  { title: "Model Try On", value: "tryon", icon: Gem },
  { title: "Model Shoot", value: "shoot", icon: SwitchCamera },
  { title: "Edit Image", value: "editImage", icon: Wand2 },
  { title: "Generate New Designs", value: "generateNewDesigns", icon: Sparkles },
  { title: "Change Embroidery / Print", value: "embroideryPrint", icon: Paintbrush },
  { title: "Try On Video", value: "video", icon: Video },
  { title: "My Gallery", value: "gallery", icon: Images },
  { title: "Catalogue", value: "catalogue", icon: LibraryBig },
  { title: "Manage Models", value: "models", icon: Users },
  { title: "Manage Poses", value: "poses", icon: PersonStanding },
  { title: "Manage Close-Up Poses", value: "closeUpPoses", icon: LucideCamera },
  { title: "Manage Model Poses", value: "modelPoses", icon: UserPen },
  { title: "Manage Backgrounds", value: "backgrounds", icon: ImagePlus },
  { title: "Catalog Viewer Management", value: "catalogViewerManagement", icon: UserCog },
];

interface AppSidebarProps {
  activeTab: TabValue;
  onTabChange: (tab: TabValue) => void;
}

export function AppSidebar({ activeTab, onTabChange }: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { logout } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {!collapsed && "axonGem Admin"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.value}>
                  <SidebarMenuButton
                    isActive={activeTab === item.value}
                    onClick={() => onTabChange(item.value)}
                    tooltip={item.title}
                  >
                    <item.icon className="h-4 w-4" />
                    {!collapsed && <span>{item.title}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} tooltip="Sign Out">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
