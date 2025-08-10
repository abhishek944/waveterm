// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { clsx } from "clsx";
import { Choose, If, Otherwise, When } from "tsx-control-statements/components";
import { observer } from "mobx-react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

interface AuxiliaryCmdViewProps {
    title?: string;
    className?: string;
    iconClass?: string;
    titleBarContents?: React.ReactElement[];
    children?: React.ReactNode;
    onClose?: React.MouseEventHandler<HTMLDivElement>;
    onScrollbarInitialized?: () => void;
    scrollable?: boolean;
}

export const AuxiliaryCmdView: React.FC<AuxiliaryCmdViewProps> = observer((props) => {
    const { title, className, iconClass, titleBarContents, children, onClose, onScrollbarInitialized, scrollable } =
        props;

    return (
        <div className={clsx("flex flex-col overflow-hidden h-full", className)}>
            <If condition={title || onClose || titleBarContents || iconClass}>
                <div className="bg-gray-800 text-blue-500 px-2.5 py-1.5 flex-shrink-0 flex flex-row w-full border-b border-gray-700 font-sans select-none cursor-default leading-5 overflow-hidden">
                    <If condition={iconClass != null}>
                        <div className="mr-2.5">
                            <i className={iconClass} />
                        </div>
                    </If>
                    <div className="font-bold mr-2.5">{title}</div>

                    <If condition={titleBarContents != null}>{titleBarContents}</If>

                    <div className="flex-grow"></div>

                    <If condition={onClose != null}>
                        <div className="cursor-pointer" title="Close (ESC)" onClick={onClose}>
                            <i className="fa-sharp fa-solid fa-xmark-large text-gray-400 hover:text-white" />
                        </div>
                    </If>
                </div>
            </If>
            <If condition={children != null}>
                <Choose>
                    <When condition={scrollable}>
                        <OverlayScrollbarsComponent
                            className="flex-grow p-2 pl-3"
                            options={{ scrollbars: { autoHide: "leave" } }}
                            defer={true}
                            events={{ initialized: onScrollbarInitialized }}
                        >
                            {children}
                        </OverlayScrollbarsComponent>
                    </When>
                    <Otherwise>
                        <div className="flex-grow p-2 pl-3">{children}</div>
                    </Otherwise>
                </Choose>
            </If>
        </div>
    );
});