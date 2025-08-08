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
import { Sidebar, SidebarHeader, SidebarContent } from "../../components/ui/sidebar";
import { cn } from "../../lib/utils";
dayjs.extend(localizedFormat);

/* @mobxReact.observer
class KeybindDevPane extends React.Component<{}, {}> {
    render() {
        let curActiveKeybinds: Array<{ name: string; domains: Array<string> }> =
            GlobalModel.keybindManager.getActiveKeybindings();
        let keybindLevel: { name: string; domains: Array<string> } = null;
        let domain: string = null;
        let curVersion = GlobalModel.keybindManager.getActiveKeybindsVersion().get();
        let levelIdx: number = 0;
        let domainIdx: number = 0;
        let lastKeyData = GlobalModel.keybindManager.getLastKeyData();
        return (
            <div className="keybind-debug-pane">
                <div className="keybind-pane-title">Keybind Manager</div>
                <For index="levelIdx" each="keybindLevel" of={curActiveKeybinds}>
                    <div className="keybind-level" key={"level-" + curVersion + levelIdx}>
                        {keybindLevel.name}
                    </div>
                    <For index="domainIdx" each="domain" of={keybindLevel.domains}>
                        <div className="keybind-domain" key={"domain-" + curVersion + domainIdx}>
                            {domain}
                        </div>
                    </For>
                </For>
                <br />
                <br />
                <div>
                    <h1>Last KeyPress Domain: {lastKeyData.domain}</h1>
                    <h1>Last KeyPress key: {lastKeyData.keyPress}</h1>
                </div>
            </div>
        );
    }
}

class SidebarKeyBindings extends React.Component<{ component: RightSideBar }, {}> {
    componentDidMount(): void {
        const { component } = this.props;
        const keybindManager = GlobalModel.keybindManager;
        keybindManager.registerKeybinding("pane", "rightsidebar", "rightsidebar:toggle", (waveEvent) => {
            return component.toggleCollapse();
        });
    }

    componentDidUpdate(): void {
        // remove for now (needs to take into account right sidebar focus so it doesn't conflict with other ESC keybindings)
    }

    componentWillUnmount(): void {
        GlobalModel.keybindManager.unregisterDomain("rightsidebar");
    }

    render() {
        return null;
    }
} */

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
        <Sidebar
            className={cn("w-[300px]", {
                "w-0": isCollapsed,
            })}
        >
            <SidebarHeader>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetMode("aichat")}
                        className={cn("flex items-center gap-2", mode === "aichat" && "bg-accent")}
                    >
                        <i className="fa-sharp fa-regular fa-sparkles" />
                        <span>Wave AI</span>
                    </Button>
                </div>
                <Button variant="ghost" size="icon" onClick={toggleCollapse} className="h-8 w-8">
                    <i className="fa-sharp fa-solid fa-xmark-large" />
                </Button>
            </SidebarHeader>
            <SidebarContent>
                <If condition={mode === "aichat" && !isCollapsed}>
                    <ChatSidebar />
                </If>
            </SidebarContent>
        </Sidebar>
    );
});

export { RightSideBar };
