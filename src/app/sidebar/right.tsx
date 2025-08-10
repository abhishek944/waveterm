// Copyright 2023-2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobxReact from "mobx-react";
import * as mobx from "mobx";
import dayjs from "dayjs";
import { If } from "tsx-control-statements/components";

import localizedFormat from "dayjs/plugin/localizedFormat";
import { GlobalModel } from "@/models";
// import { WaveBookDisplay } from "./wavebook";
import { ChatSidebar } from "./aichat";
// import { boundMethod } from "autobind-decorator";
import { Button } from "../../components/ui/button";
import { SidebarContent, SidebarFooter } from "../../components/ui/sidebar";
import { ResizableSidebar } from "../../components/ui/resizable-sidebar";
import { SimplePromptBox } from "../../components/ui/SimplePromptBox";
import { cn } from "../../lib/utils";
dayjs.extend(localizedFormat);

const RightSideBar: React.FC<{ parentRef: React.RefObject<HTMLElement> }> = mobxReact.observer(({ parentRef }) => {
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
            className={cn("sidebar ai-chat-gradient", {
                "w-0": isCollapsed,
            })}
        >
            <div className="flex flex-col h-full">
                <div className="absolute top-2 right-2 z-10">
                    <Button variant="ghost" size="icon" onClick={toggleCollapse} className="h-8 w-8 rounded-full bg-white/10 text-white hover:bg-white/20">
                        <i className="fa-sharp fa-solid fa-xmark" />
                    </Button>
                </div>
                <SidebarContent>
                    <If condition={mode === "aichat" && !isCollapsed}>
                        <ChatSidebar />
                    </If>
                </SidebarContent>
                <SidebarFooter className="border-t-0 bg-transparent p-4">
                    <SimplePromptBox />
                </SidebarFooter>
            </div>
        </ResizableSidebar>
    );
});

export { RightSideBar };
