// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import { isBlank } from "@/utils/util";
import mustache from "mustache";
import DOMPurify from "dompurify";
import { GlobalModel } from "@/models";

export const SimpleMustacheRenderer: React.FC<{
    data: ExtBlob;
    context: RendererContext;
    opts: RendererOpts;
    savedHeight: number;
    lineState: LineStateType;
}> = observer(({ data, context, opts, savedHeight, lineState }) => {
    const [templateLoading, setTemplateLoading] = React.useState(true);
    const [templateLoadError, setTemplateLoadError] = React.useState<string | null>(null);
    const [dataLoading, setDataLoading] = React.useState(true);
    const [dataLoadError, setDataLoadError] = React.useState<string | null>(null);
    const [mustacheTemplateText, setMustacheTemplateText] = React.useState<string | null>(null);
    const [parsedData, setParsedData] = React.useState<any>(null);

    const reloadTemplate = React.useCallback(() => {
        if (isBlank(lineState.template)) {
            setTemplateLoading(false);
            setTemplateLoadError(`no 'template' specified`);
            return;
        }
        setTemplateLoading(true);
        setTemplateLoadError(null);
        const quotedTemplateName = JSON.stringify(lineState.template);
        GlobalModel.readRemoteFile(context.screenId, context.lineId, lineState.template)
            .then((file) => {
                if (file.notFound) {
                    setTemplateLoadError(`mustache template ${quotedTemplateName} not found`);
                    return null;
                }
                return file.text();
            })
            .then((text) => {
                if (isBlank(text)) {
                    setTemplateLoadError(`blank mustache template ${quotedTemplateName}`);
                    return;
                }
                setMustacheTemplateText(text);
                setTemplateLoading(false);
            })
            .catch((e) => {
                setTemplateLoadError(`loading mustache template ${quotedTemplateName}: ${e}`);
            });
    }, [context.screenId, context.lineId, lineState.template]);

    const reloadData = React.useCallback(() => {
        if (data == null || data.notFound) {
            setDataLoading(false);
            setDataLoadError(`file ${data?.name ? JSON.stringify(data.name) : ""} not found`);
            return;
        }
        setDataLoading(true);
        setDataLoadError(null);
        const quotedDataName = data.name || '"terminal output"';
        data.text()
            .then((text) => {
                try {
                    setParsedData(JSON.parse(text));
                    setDataLoading(false);
                } catch (e) {
                    setDataLoadError(`parsing json data from ${quotedDataName}: ${e}`);
                }
            })
            .catch((e) => {
                setDataLoadError(`loading json data ${quotedDataName}: ${e}`);
            });
    }, [data]);

    React.useEffect(() => {
        reloadTemplate();
        reloadData();
    }, [reloadTemplate, reloadData]);

    const doRefresh = () => {
        reloadTemplate();
    };

    const errorMessage = dataLoadError ?? templateLoadError;
    if (errorMessage != null) {
        return (
            <div className="text-main" style={{ fontSize: opts.termFontSize }}>
                <div className="text-red-500">ERROR: {errorMessage}</div>
                <div className="absolute bottom-[-3px] right-0">
                    <div className="inline-block relative mr-[26px]">
                        <div
                            onClick={doRefresh}
                            className="rounded-t px-2 py-1 text-center text-gray-800 bg-main"
                            title="reload template and re-render content"
                        >
                            refresh
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (templateLoading || dataLoading) {
        return (
            <div className="text-main" style={{ fontSize: opts.termFontSize, height: savedHeight }}>
                <div className="animate-pulse">
                    loading content <i className="fa fa-ellipsis fa-fade" />
                </div>
                <div className="absolute bottom-[-3px] right-0">
                    <div className="inline-block relative mr-[26px]">
                        <div
                            onClick={doRefresh}
                            className="rounded-t px-2 py-1 text-center text-gray-800 bg-main"
                            title="reload template and re-render content"
                        >
                            refresh
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    let renderedText: string;
    try {
        renderedText = mustache.render(mustacheTemplateText, parsedData || {});
        renderedText = DOMPurify.sanitize(renderedText);
    } catch (e) {
        return (
            <div className="text-main" style={{ fontSize: opts.termFontSize }}>
                <div className="text-red-500">ERROR running template: {e.message}</div>
                <div className="absolute bottom-[-3px] right-0">
                    <div className="inline-block relative mr-[26px]">
                        <div
                            onClick={doRefresh}
                            className="rounded-t px-2 py-1 text-center text-gray-800 bg-main"
                            title="reload template and re-render content"
                        >
                            refresh
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const maxWidth = opts.maxSize.width;
    let minWidth = opts.maxSize.width;
    if (minWidth > 1000) {
        minWidth = 1000;
    }

    return (
        <div className="text-main" style={{ fontSize: 16 }}>
            <div
                className="overflow-y-auto"
                style={{
                    maxHeight: opts.maxSize.height,
                    minWidth: minWidth,
                    width: "min-content",
                    maxWidth: maxWidth,
                }}
            >
                <div
                    className="mustache content"
                    style={{ maxHeight: opts.maxSize.height }}
                    dangerouslySetInnerHTML={{ __html: renderedText }}
                />
            </div>
            <div className="absolute bottom-[-3px] right-0">
                <div className="inline-block relative mr-[26px]">
                    <div
                        onClick={doRefresh}
                        className="rounded-t px-2 py-1 text-center text-gray-800 bg-main"
                        title="reload template and re-render content"
                    >
                        refresh
                    </div>
                </div>
            </div>
        </div>
    );
});