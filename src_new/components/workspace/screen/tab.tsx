// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import * as mobx from "mobx";
import { clsx } from "clsx";
import { GlobalModel, GlobalCommandRunner, Screen } from "@/models";
import { ActionsIcon, StatusIndicator, CenteredIcon } from "@/components/icons/icons";
import { Reorder } from "framer-motion";
import { MagicLayout } from "@/components/ui/magiclayout";
import * as appconst from "@/appconst";

const colorMapping = {
    green: "text-green-500",
    default: "text-green-500",
    orange: "text-orange-500",
    red: "text-red-500",
    yellow: "text-yellow-500",
    blue: "text-blue-500",
    mint: "text-mint-500",
    cyan: "text-cyan-500",
    white: "text-white",
    violet: "text-violet-500",
    pink: "text-pink-500",
};

export const ScreenTab: React.FC<{
    screen: Screen;
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

    return (
        <Reorder.Item
            ref={tabRef}
            value={screen}
            id={`screentab-${screen.screenId}`}
            data-screenid={screen.screenId}
            className={clsx(
                "screen-tab flex flex-row relative border-t-2 bg-transparent",
                isActive ? `border-${tabColor}` : "border-transparent",
                `text-${tabColor}`,
                { "is-archived": screen.archived.get() }
            )}
            onPointerDown={() => onSwitchScreen(screen.screenId)}
            onContextMenu={onContextMenu}
            onDragEnd={handleDragEnd}
        >
            <div
                className={clsx(
                    "background absolute top-0 left-0 w-full h-full z-10",
                    isActive ? `bg-${tabColor}` : ""
                )}
                style={{ maskImage: "linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0) 100%)" }}
            />
            <div className="screen-tab-inner absolute top-0 left-0 w-full h-full flex flex-row items-center z-20 px-2 py-1 cursor-pointer">
                <CenteredIcon className="front-icon">
                    <TabIcon icon={screen.getTabIcon()} color={tabColor} />
                </CenteredIcon>
                <div className="tab-name truncate flex-grow">
                    {screen.archived.get() && <i title="archived" className="fa-sharp fa-solid fa-box-archive mr-1" />}
                    {screen.name.get()}
                </div>
                <div className="end-icons flex items-center">
                    <StatusIndicator level={screen.statusIndicator.get()} runningCommands={screen.numRunningCmds.get() > 0} />
                    <ActionsIcon onClick={openScreenSettings} />
                </div>
            </div>
            <div className="vertical-line border-l border-gray-700 my-2.5" />
        </Reorder.Item>
    );
});