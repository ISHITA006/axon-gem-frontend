import {
  Gem,
  Images,
  Users,
  LogOut,
  ImagePlus,
  LibraryBig,
  UserCog,
  Wand2,
  PersonStanding,
  UserPen,
  LucideCamera,
  Aperture,
  Rotate3D,
  Palette,
  SquareUser,
  BriefcaseBusiness,
  Shirt,
  BarChart3,
  Sparkles,
} from "lucide-react";
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
  | "sdTryon"
  | "compositeTryon"
  | "colour"
  | "length"
  | "manualPhotoEdit"
  | "gallery"
  | "catalogue"
  | "uploadStudioShoot"
  | "models"
  | "poses"
  | "clothing"
  | "closeUpPoses"
  | "productAngles"
  | "productSideAngles"
  | "modelPoses"
  | "backgrounds"
  | "catalogViewerManagement"
  | "editImage"
  | "brandKit"
  | "productBrandKit"
  | "generationUsage";

const navItems: { title: string; value: TabValue; icon: React.ElementType }[] = [
  { title: "Product Shoot", value: "uploadStudioShoot", icon: Gem },
  { title: "Model Shoot", value: "tryon", icon: SquareUser },
  { title: "Composite Try-On", value: "compositeTryon", icon: Sparkles },
  { title: "SD Model Shoot", value: "sdTryon", icon: Aperture },
  { title: "Edit Image", value: "editImage", icon: Wand2 },
  { title: "Product Shoot Brand Kit", value: "productBrandKit", icon: BriefcaseBusiness },
  { title: "Model Shoot Brand Kit", value: "brandKit", icon: Palette },
  { title: "My Gallery", value: "gallery", icon: Images },
  { title: "Generation Usage", value: "generationUsage", icon: BarChart3 },
  { title: "Catalogue", value: "catalogue", icon: LibraryBig },
  { title: "Manage Models", value: "models", icon: Users },
  { title: "Manage Poses", value: "poses", icon: PersonStanding },
  { title: "Manage Clothing", value: "clothing", icon: Shirt },
  { title: "Manage Product Angles", value: "productAngles", icon: Aperture },
  { title: "Manage Product Side Angles", value: "productSideAngles", icon: Rotate3D },
  { title: "Manage Model Poses", value: "modelPoses", icon: UserPen },
  { title: "Manage Close-Up Poses", value: "closeUpPoses", icon: LucideCamera },
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
