import { useState } from "react";
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
  Settings,
  ChevronUp,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/contexts/AuthContext";

export type TabValue =
  | "tryon"
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

type NavItem = { title: string; value: TabValue; icon: React.ElementType };

const mainNavItems: NavItem[] = [
  { title: "Product Shoot", value: "uploadStudioShoot", icon: Gem },
  { title: "Model Shoot", value: "tryon", icon: SquareUser },
  { title: "Edit Image", value: "editImage", icon: Wand2 },
  { title: "My Gallery", value: "gallery", icon: Images },
  { title: "Catalogue", value: "catalogue", icon: LibraryBig },
];

const settingsNavItems: NavItem[] = [
  { title: "Manage Models", value: "models", icon: Users },
  { title: "Manage Poses", value: "poses", icon: PersonStanding },
  { title: "Manage Clothing", value: "clothing", icon: Shirt },
  { title: "Manage Product Angles", value: "productAngles", icon: Aperture },
  { title: "Manage Product Side Angles", value: "productSideAngles", icon: Rotate3D },
  { title: "Manage Model Poses", value: "modelPoses", icon: UserPen },
  { title: "Manage Close-Up Poses", value: "closeUpPoses", icon: LucideCamera },
  { title: "Manage Backgrounds", value: "backgrounds", icon: ImagePlus },
  { title: "Catalog Viewer Management", value: "catalogViewerManagement", icon: UserCog },
  { title: "Product Shoot Brand Kit", value: "productBrandKit", icon: BriefcaseBusiness },
  { title: "Model Shoot Brand Kit", value: "brandKit", icon: Palette },
];

const settingsTabValues = new Set(settingsNavItems.map((item) => item.value));

interface AppSidebarProps {
  activeTab: TabValue;
  onTabChange: (tab: TabValue) => void;
}

export function AppSidebar({ activeTab, onTabChange }: AppSidebarProps) {
  const { state, setOpen } = useSidebar();
  const collapsed = state === "collapsed";
  const { logout } = useAuth();
  const settingsTabActive = settingsTabValues.has(activeTab);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{!collapsed && "axonGem Admin"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
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
            <SidebarMenuButton
              isActive={activeTab === "generationUsage"}
              onClick={() => onTabChange("generationUsage")}
              tooltip="Generation Usage"
            >
              <BarChart3 className="h-4 w-4" />
              {!collapsed && <span>Generation Usage</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {collapsed ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={settingsTabActive}
                tooltip="Settings"
                onClick={() => {
                  setOpen(true);
                  setSettingsOpen(true);
                }}
              >
                <Settings className="h-4 w-4" />
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={logout} tooltip="Sign Out">
                <LogOut className="h-4 w-4" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : (
          <>
            <Collapsible
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              className="group/settings"
            >
              <SidebarMenu>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={settingsTabActive} tooltip="Settings">
                      <Settings className="h-4 w-4" />
                      <span>Settings</span>
                      <ChevronUp className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/settings:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub className="max-h-[min(50vh,22rem)] overflow-y-auto">
                      {settingsNavItems.map((item) => (
                        <SidebarMenuSubItem key={item.value}>
                          <SidebarMenuSubButton asChild isActive={activeTab === item.value}>
                            <button type="button" onClick={() => onTabChange(item.value)}>
                              <item.icon />
                              <span>{item.title}</span>
                            </button>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </SidebarMenu>
            </Collapsible>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={logout} tooltip="Sign Out">
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
