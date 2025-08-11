// Copyright 2023-2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import dayjs from "dayjs";
import { If } from "tsx-control-statements/components";

import localizedFormat from "dayjs/plugin/localizedFormat";
import { GlobalModel } from "@/models";
import { ChatSidebar } from "./aichat";
import { Button } from "@/components/ui/button";
import { SidebarContent, SidebarFooter } from "@/components/ui/sidebar";
import { ResizableSidebar } from "@/components/ui/resizable-sidebar";
import { SimplePromptBox } from "@/components/ui/SimplePromptBox";
import { cn } from "@/lib/utils";
dayjs.extend(localizedFormat);

const RightSideBar: React.FC = observer(() => {
    const [mode, setMode] = React.useState("aichat");
    const timeoutIdRef = React.useRef<NodeJS.Timeout | null>(null);

    React.useEffect(() => {
        return () => {
            if (timeoutIdRef.current) {
                clearTimeout(timeoutIdRef.current);
            }
        };
    }, []);

    const handleSetMode = (newMode: string) => {
        if (newMode !== mode) {
            setMode(newMode);
        }
    };

    const toggleCollapse = () => {
        const isCollapsed = GlobalModel.rightSidebarModel.getCollapsed();
        GlobalModel.rightSidebarModel.setCollapsed(!isCollapsed);
        if (mode === "aichat") {
            if (isCollapsed) {
                timeoutIdRef.current = setTimeout(() => {
                    GlobalModel.inputModel.setChatSidebarFocus();
                }, 100);
            } else {
                GlobalModel.inputModel.setChatSidebarFocus(false);
            }
        }
        return true;
    };

    const isCollapsed = GlobalModel.rightSidebarModel.getCollapsed();

    return (
        <ResizableSidebar
            position="right"
            collapsed={isCollapsed}
            className={cn("flex flex-col relative bg-[#0e131f]", { "w-0": isCollapsed })}
        >
            {/* Gradient background */}
            <div
                className="absolute bottom-0 left-0 right-0 h-[70%] z-0"
                style={{
                    background:
                        "radial-gradient(ellipse at bottom right, rgba(172, 92, 255, 0.7) -10%, rgba(79, 70, 229, 0) 70%), radial-gradient(ellipse at bottom left, rgba(56, 189, 248, 0.7) -10%, rgba(79, 70, 229, 0) 70%)",
                    filter: "blur(40px)",
                }}
            />
            <div className="relative z-10 flex flex-col h-full min-h-0">
                <If condition={!isCollapsed}>
                    <div className="flex items-center justify-end h-12 pr-2 flex-shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleCollapse}
                            className="h-8 w-8 rounded-full bg-white/10 text-white hover:bg-white/20"
                        >
                            <i className="fa-sharp fa-solid fa-xmark" />
                        </Button>
                    </div>
                </If>
                <SidebarContent className="flex-1 min-h-0 overflow-auto">
                    <If condition={mode === "aichat" && !isCollapsed}>
                        <ChatSidebar />
                    </If>
                </SidebarContent>
                <SidebarFooter className="border-t-0 bg-transparent p-2 flex-shrink-0">
                    <SimplePromptBox />
                </SidebarFooter>
            </div>
        </ResizableSidebar>
    );
});

export { RightSideBar };
