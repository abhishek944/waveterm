// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobx from "mobx";
import { observer } from "mobx-react";
import { debounce } from "throttle-debounce";
import * as util from "@/utils/util";
import { GlobalModel } from "@/models";
import { clsx } from "clsx";

export class SimpleBlobRendererModel {
    context: RendererContext;
    opts: RendererOpts;
    isDone: OV<boolean>;
    api: RendererModelContainerApi;
    savedHeight: number;
    loading: OV<boolean>;
    loadError: OV<string> = mobx.observable.box(null, {
        name: "renderer-loadError",
    });
    lineState: LineStateType;
    ptyData: PtyDataType;
    ptyDataSource: (termContext: TermContextUnion) => Promise<PtyDataType>;
    dataBlob: ExtBlob;
    readOnly: boolean;
    notFound: boolean;
    isClosed: boolean;

    initialize(params: RendererModelInitializeParams): void {
        this.lineState = params.lineState;
        this.isClosed = !!params.lineState["prompt:closed"];
        this.loading = mobx.observable.box(!this.isClosed, { name: "renderer-loading" });
        this.isDone = mobx.observable.box(params.isDone, {
            name: "renderer-isDone",
        });
        this.context = params.context;
        this.opts = params.opts;
        this.api = params.api;
        this.savedHeight = params.savedHeight;
        this.ptyDataSource = params.ptyDataSource;
        if (this.isClosed) {
            this.dataBlob = new Blob() as ExtBlob;
            this.dataBlob.notFound = false; // TODO
        } else {
            if (this.isDone.get()) {
                setTimeout(() => this.reload(0), 10);
            }
        }
    }

    dispose(): void {
        return;
    }

    giveFocus(): void {
        return;
    }

    updateOpts(update: RendererOptsUpdate): void {
        Object.assign(this.opts, update);
    }

    updateHeight(newHeight: number): void {
        if (this.savedHeight != newHeight) {
            this.savedHeight = newHeight;
            this.api.saveHeight(newHeight);
        }
    }

    setIsDone(): void {
        if (this.isDone.get()) {
            return;
        }
        mobx.action(() => {
            this.isDone.set(true);
        })();
        this.reload(0);
    }

    reload(delayMs: number): void {
        // If data is already loaded, don't reload
        if (this.dataBlob != null) {
            return;
        }
        mobx.action(() => {
            this.loading.set(true);
        })();
        if (delayMs == 0) {
            this.reload_noDelay();
        } else {
            setTimeout(() => {
                this.reload_noDelay();
            }, delayMs);
        }
    }

    reload_noDelay(): void {
        let source = this.lineState["prompt:source"] || "pty";
        if (source == "pty") {
            this.reloadPtyData();
        } else if (source == "file") {
            this.reloadFileData();
        } else {
            mobx.action(() => {
                this.loadError.set("error: invalid load source: " + source);
            })();
        }
    }

    reloadFileData(): void {
        let path = this.lineState["prompt:file"];
        if (util.isBlank(path)) {
            mobx.action(() => {
                this.loadError.set("renderer has file source, but no prompt:file specified");
            })();
            return;
        }
        let rtnp = GlobalModel.readRemoteFile(this.context.screenId, this.context.lineId, path);
        rtnp.then((file) => {
            this.notFound = (file as any).notFound;
            this.readOnly = (file as any).readOnly;
            this.dataBlob = file;
            mobx.action(() => {
                this.loading.set(false);
                this.loadError.set(null);
            })();
        }).catch((e) => {
            mobx.action(() => {
                this.loadError.set("error loading file data: " + e);
            })();
        });
    }

    reloadPtyData(): void {
        this.readOnly = true;
        let rtnp = this.ptyDataSource(this.context);
        if (rtnp == null) {
            console.log("no promise returned from ptyDataSource (simplerenderer)", this.context);
            return;
        }
        rtnp.then((ptydata) => {
            this.ptyData = ptydata;
            let blob: ExtBlob = new Blob([this.ptyData.data]) as ExtBlob;
            blob.notFound = false;
            this.dataBlob = blob;
            mobx.action(() => {
                this.loading.set(false);
                this.loadError.set(null);
            })();
        }).catch((e) => {
            mobx.action(() => {
                this.loadError.set("error loading data: " + e);
            })();
        });
    }

    receiveData(pos: number, data: Uint8Array, reason?: string): void {
        // this.dataBuf.receiveData(pos, data, reason);
    }
}

export const SimpleBlobRenderer: React.FC<{
    rendererContainer: RendererContainerType;
    lineId: string;
    plugin: RendererPluginType;
    onHeightChange: () => void;
    initParams: RendererModelInitializeParams;
    scrollToBringIntoViewport: () => void;
    isSelected: boolean;
    shouldFocus: boolean;
}> = observer((props) => {
    const { rendererContainer, lineId, plugin, onHeightChange, initParams, scrollToBringIntoViewport, isSelected, shouldFocus } = props;
    
    // Use a ref to store the model to prevent recreation
    const modelRef = React.useRef<SimpleBlobRendererModel>(null);
    
    if (!modelRef.current) {
        const newModel = new SimpleBlobRendererModel();
        newModel.initialize(initParams);
        rendererContainer.registerRenderer(lineId, newModel);
        modelRef.current = newModel;
    }
    
    const model = modelRef.current;

    const wrapperDivRef = React.useRef<HTMLDivElement>(null);

    const updateHeight = React.useCallback(
        debounce(1000, (newHeight: number) => {
            model.updateHeight(newHeight);
        }),
        [model]
    );

    const handleResize = React.useCallback(() => {
        if (model.loading.get()) {
            return;
        }
        if (onHeightChange) {
            onHeightChange();
        }
        if (!model.loading.get() && wrapperDivRef.current != null) {
            let height = wrapperDivRef.current.offsetHeight;
            updateHeight(height);
        }
    }, [model, onHeightChange, updateHeight]);

    React.useEffect(() => {
        const rszObs = new ResizeObserver(handleResize);
        if (wrapperDivRef.current) {
            rszObs.observe(wrapperDivRef.current);
        }
        return () => {
            rendererContainer.unloadRenderer(lineId);
            rszObs.disconnect();
        };
    }, [handleResize, rendererContainer, lineId]);

    if (model.loadError.get() != null) {
        let errorText = model.loadError.get();
        let height = model.savedHeight;
        return (
            <div ref={wrapperDivRef} style={{ minHeight: height, fontSize: model.opts.termFontSize }}>
                <div className="text-red-500">ERROR: {errorText}</div>
            </div>
        );
    }
    if (model.loading.get()) {
        let height = model.savedHeight;
        return (
            <div
                ref={wrapperDivRef}
                className={clsx("animate-pulse", { "h-0": height == 0 })}
                style={{ minHeight: height, fontSize: model.opts.termFontSize }}
            >
                loading content <i className="fa fa-ellipsis fa-fade" />
            </div>
        );
    }

    const Comp = plugin.simpleComponent;
    if (Comp == null) {
        return <div ref={wrapperDivRef}>(no component found in plugin)</div>;
    }

    const { festate, cmdstr, exitcode } = initParams.rawCmd;
    // Don't apply h-0 for image and code plugins as they need to expand
    const shouldApplyZeroHeight = model.savedHeight == 0 && plugin.name !== "image" && plugin.name !== "code";
    return (
        <div ref={wrapperDivRef} className={clsx("sr-wrapper", { "h-0": shouldApplyZeroHeight })}>
            <Comp
                cwd={festate.cwd}
                cmdstr={cmdstr}
                exitcode={exitcode}
                data={model.dataBlob}
                readOnly={model.readOnly}
                notFound={model.notFound}
                lineState={model.lineState}
                context={model.context}
                opts={model.opts}
                savedHeight={model.savedHeight}
                scrollToBringIntoViewport={scrollToBringIntoViewport}
                isSelected={isSelected}
                shouldFocus={shouldFocus}
                rendererApi={model.api}
            />
        </div>
    );
});