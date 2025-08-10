// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import { sprintf } from "sprintf-js";
import { Markdown } from "@/components/ui/markdown";

const MaxMarkdownSize = 200000;
const DefaultMaxMarkdownWidth = 1000;

export const SimpleMarkdownRenderer: React.FC<{
    data: ExtBlob;
    context: RendererContext;
    opts: RendererOpts;
    savedHeight: number;
    lineState: LineStateType;
}> = observer(({ data, opts, savedHeight }) => {
    const [markdownText, setMarkdownText] = React.useState<string | null>(null);
    const [markdownError, setMarkdownError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (data == null || data.notFound) {
            return;
        }
        if (data.size > MaxMarkdownSize) {
            setMarkdownError(sprintf("error: markdown too large to render size=%d", data.size));
            return;
        }
        data.text().then((text) => {
            if (/[\x00-\x08]/.test(text)) {
                setMarkdownError(sprintf("error: not rendering markdown, binary characters detected"));
                return;
            }
            setMarkdownText(text);
        });
    }, [data]);

    if (data == null || data.notFound) {
        return (
            <div className="text-main" style={{ fontSize: opts.termFontSize }}>
                <div className="text-red-500">
                    ERROR: file {data?.name ? JSON.stringify(data.name) : ""} not found
                </div>
            </div>
        );
    }

    if (markdownError) {
        return (
            <div className="text-main" style={{ fontSize: opts.termFontSize }}>
                <div className="text-red-500">{markdownError}</div>
            </div>
        );
    }

    if (markdownText === null) {
        return <div className="h-full" style={{ height: savedHeight }} />;
    }

    return (
        <div className="text-main">
            <div className="overflow-y-auto" style={{ maxHeight: opts.maxSize.height }}>
                <Markdown text={markdownText} />
            </div>
        </div>
    );
});