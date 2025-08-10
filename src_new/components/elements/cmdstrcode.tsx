// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { clsx } from "clsx";

import { ReactComponent as CheckIcon } from "@/assets/icons/line/check.svg";
import { ReactComponent as CopyIcon } from "@/assets/icons/history/copy.svg";

interface CmdStrCodeProps {
    cmdstr: string;
    onUse: () => void;
    onCopy: () => void;
    isCopied: boolean;
    fontSize: "normal" | "large";
    limitHeight: boolean;
}

const CmdStrCode: React.FC<CmdStrCodeProps> = ({
    cmdstr,
    onUse,
    onCopy,
    isCopied,
    fontSize,
    limitHeight
}) => {
    const handleUse = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onUse != null) {
            onUse();
        }
    };

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onCopy != null) {
            onCopy();
        }
    };

    return (
        <div className={clsx("cmdstr-code", { "is-large": fontSize == "large" }, { "limit-height": limitHeight })}>
            {isCopied && (
                <div key="copied" className="copied-indicator">
                    <div>copied</div>
                </div>
            )}
            <div key="use" className="use-button hoverEffect" title="Use Command" onClick={handleUse}>
                <CheckIcon className="icon" />
            </div>
            <div key="code" className="code-div">
                <code>{cmdstr}</code>
            </div>
            <div key="copy" className="copy-control hoverEffect">
                <div className="inner-copy" onClick={handleCopy} title="copy">
                    <CopyIcon className="icon" />
                </div>
            </div>
        </div>
    );
};

export { CmdStrCode };