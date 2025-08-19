// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import * as mobx from "mobx";
import { clsx } from "clsx";
import { GlobalModel, GlobalCommandRunner, Screen } from "@/models";
import { ActionsIcon, StatusIndicator } from "@/components/icons/icons";
import { Reorder } from "framer-motion";
import { MagicLayout } from "@/components/ui/magiclayout";
import * as appconst from "@/appconst";
import { TabIcon } from "@/components/ui/tabicon";

export const ScreenTab: React.FC<{
    screen: any;
    activeScreenId: string;
    index: number;
    onSwitchScreen: (screenId: string) => void;
}> = observer(({ screen, activeScreenId, index, onSwitchScreen }) => {
    const tabRef = React.useRef<HTMLDivElement>(null);

    const handleDragEnd = () => {
        setTimeout(() => {
            const tabElement = tabRef.current;
            if (tabElement) {
                const finalTabPosition = tabElement.offsetLeft;
                const newIndex = Math.floor(finalTabPosition / MagicLayout.TabWidth);
                GlobalCommandRunner.screenReorder(screen.screenId, `${newIndex + 1}`);
            }
        }, 100);
    };

    const openScreenSettings = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const activeSession = GlobalModel.getActiveSession();
        if (activeSession && screen) {
            mobx.action(() => {
                GlobalModel.screenSettingsModal.set({
                    sessionId: activeSession.sessionId,
                    screenId: screen.screenId,
                });
            })();
            GlobalModel.modalsModel.pushModal(appconst.SCREEN_SETTINGS);
        }
    };

    const onContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeScreenId !== screen.screenId) {
            GlobalCommandRunner.switchScreen(screen.screenId);
            return;
        }
        const colorSubMenu: ContextMenuItem[] = appconst.TabColors.map((color) => ({
            label: color,
            click: () => GlobalCommandRunner.screenSetSettings(screen.screenId, { tabcolor: color }, false),
        }));
        const menu: ContextMenuItem[] = [
            { label: "New Tab", click: () => GlobalCommandRunner.createNewScreen() },
            { type: "separator" },
            { label: "Set Tab Color", submenu: colorSubMenu },
            {
                label: "All Tab Settings",
                click: () =>
                    openScreenSettings({ preventDefault: () => {}, stopPropagation: () => {} } as React.MouseEvent),
            },
            { type: "separator" },
            { label: "Close Tab", click: () => GlobalModel.onCloseCurrentTab() },
        ];
        GlobalModel.contextMenuModel.showContextMenu(menu, { x: e.clientX, y: e.clientY });
    };

    const tabColor = screen.getTabColor();
    const isActive = activeScreenId === screen.screenId;

    const getTabColorStyles = (color: string): React.CSSProperties => {
        const solidColorMap: { [key: string]: string } = {
            green: "var(--tab-green)",
            default: "var(--tab-green)",
            orange: "var(--tab-orange)",
            red: "var(--tab-red)",
            yellow: "var(--tab-yellow)",
            blue: "var(--tab-blue)",
            mint: "var(--tab-mint)",
            cyan: "var(--tab-cyan)",
            white: "var(--tab-white)",
            violet: "var(--tab-violet)",
            pink: "var(--tab-pink)",
        };

        if (solidColorMap[color]) {
            return { backgroundColor: solidColorMap[color] };
        }

        // Fallback to gradient if not a solid color
        const startVar = `--tab-${color}-start`;
        const endVar = `--tab-${color}-end`;
        return {
            backgroundImage: `linear-gradient(to right, var(${startVar}), var(${endVar}))`,
        };
    };

    const topBarstyle = getTabColorStyles(tabColor);

    return (
        <Reorder.Item
            ref={tabRef}
            value={screen}
            id={`screentab-${screen.screenId}`}
            data-screenid={screen.screenId}
            className={clsx("screen-tab group flex flex-row relative bg-transparent w-[155px] h-full", {
                "text-white font-semibold": isActive,
                "text-gray-400": !isActive,
            })}
            data-tabcolor={tabColor}
            onPointerDown={() => onSwitchScreen(screen.screenId)}
            onContextMenu={onContextMenu}
            onDragEnd={handleDragEnd}
        >
            {/* Top color bar */}
            {isActive && <div className="absolute top-0 left-0 right-0 h-0.5" style={topBarstyle} />}

            {/* Background glow */}
            {isActive && (
                <div
                    className="absolute inset-0 z-0 opacity-10"
                    style={{ ...topBarstyle, maskImage: "linear-gradient(to top, black, transparent)" }}
                />
            )}

            <div className="relative flex flex-row items-center w-full h-full px-2 cursor-pointer z-10">
                <div className="flex items-center justify-center w-6 h-6 flex-shrink-0">
                    <TabIcon icon={screen.getTabIcon()} color={tabColor} />
                </div>
                <div className="truncate flex-grow mx-2 text-sm">
                    {screen.archived.get() && <i title="archived" className="fa-sharp fa-solid fa-box-archive mr-1" />}
                    {screen.name.get()}
                </div>
                <div className="flex items-center space-x-1 flex-shrink-0">
                    <div className="group-hover:hidden">
                        <StatusIndicator
                            level={screen.statusIndicator.get()}
                            runningCommands={screen.numRunningCmds.get() > 0}
                        />
                    </div>
                    <div className="hidden group-hover:block">
                        <ActionsIcon onClick={openScreenSettings} />
                    </div>
                </div>
            </div>
            <div className="absolute right-0 top-2.5 bottom-2.5 w-px bg-gray-700" />
        </Reorder.Item>
    );
});