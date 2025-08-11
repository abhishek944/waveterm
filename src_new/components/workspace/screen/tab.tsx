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
        mobx.action(() => {
            GlobalModel.tabSettingsOpen.set(!GlobalModel.tabSettingsOpen.get());
        })();
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
            { label: "All Tab Settings", click: () => GlobalModel.tabSettingsOpen.set(true) },
            { type: "separator" },
            { label: "Close Tab", click: () => GlobalModel.onCloseCurrentTab() },
        ];
        GlobalModel.contextMenuModel.showContextMenu(menu, { x: e.clientX, y: e.clientY });
    };

    const tabColor = screen.getTabColor();
    const isActive = activeScreenId === screen.screenId;

    // Map tab colors to Tailwind classes
    const colorClasses = {
        green: { border: "border-green-500", bg: "bg-green-500" },
        default: { border: "border-green-500", bg: "bg-green-500" },
        orange: { border: "border-orange-500", bg: "bg-orange-500" },
        red: { border: "border-red-500", bg: "bg-red-500" },
        yellow: { border: "border-yellow-500", bg: "bg-yellow-500" },
        blue: { border: "border-blue-500", bg: "bg-blue-500" },
        mint: { border: "border-teal-500", bg: "bg-teal-500" },
        cyan: { border: "border-cyan-500", bg: "bg-cyan-500" },
        white: { border: "border-white", bg: "bg-white" },
        violet: { border: "border-violet-500", bg: "bg-violet-500" },
        pink: { border: "border-pink-500", bg: "bg-pink-500" },
    };

    const { border: borderClass, bg: bgClass } = colorClasses[tabColor] || colorClasses.default;

    return (
        <Reorder.Item
            ref={tabRef}
            value={screen}
            id={`screentab-${screen.screenId}`}
            data-screenid={screen.screenId}
            className={clsx(
                "screen-tab flex flex-row relative border-t-2 bg-transparent w-[155px] h-full",
                {
                    "border-transparent": !isActive,
                    [borderClass]: isActive,
                    "text-white font-semibold": isActive,
                    "text-gray-400": !isActive,
                }
            )}
            data-tabcolor={tabColor}
            onPointerDown={() => onSwitchScreen(screen.screenId)}
            onContextMenu={onContextMenu}
            onDragEnd={handleDragEnd}
        >
            <div
                className={clsx(
                    "absolute inset-0 z-0",
                    isActive ? bgClass : "",
                    isActive ? "opacity-10" : ""
                )}
                style={{ maskImage: isActive ? "linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0) 100%)" : undefined }}
            />
            <div className="relative flex flex-row items-center w-full h-full px-2 cursor-pointer z-10">
                <div className="flex items-center justify-center w-6 h-6 flex-shrink-0">
                    <TabIcon icon={screen.getTabIcon()} color={tabColor} />
                </div>
                <div className="truncate flex-grow mx-2 text-sm">
                    {screen.archived.get() && <i title="archived" className="fa-sharp fa-solid fa-box-archive mr-1" />}
                    {screen.name.get()}
                </div>
                <div className="flex items-center space-x-1 flex-shrink-0">
                    {!isActive && (
                        <StatusIndicator level={screen.statusIndicator.get()} runningCommands={screen.numRunningCmds.get() > 0} />
                    )}
                    {isActive && (
                        <ActionsIcon onClick={openScreenSettings} />
                    )}
                </div>
            </div>
            <div className="absolute right-0 top-2.5 bottom-2.5 w-px bg-gray-700" />
        </Reorder.Item>
    );
});