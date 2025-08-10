// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import { debounce } from "throttle-debounce";

export const IncrementalRenderer: React.FC<{
    rendererContainer: RendererContainerType;
    lineId: string;
    plugin: RendererPluginType;
    onHeightChange: () => void;
    initParams: RendererModelInitializeParams;
    isSelected: boolean;
}> = (props) => {
    const { rendererContainer, lineId, plugin, onHeightChange, initParams } = props;
    const model = React.useMemo(() => {
        const newModel = plugin.modelCtor();
        newModel.initialize(initParams);
        rendererContainer.registerRenderer(lineId, newModel);
        return newModel;
    }, [rendererContainer, lineId, plugin, initParams]);

    const wrapperDivRef = React.useRef<HTMLDivElement>(null);

    const updateHeight = React.useCallback(
        debounce(1000, (newHeight: number) => {
            model.updateHeight(newHeight);
        }),
        [model]
    );

    const handleResize = React.useCallback(() => {
        if (onHeightChange) {
            onHeightChange();
        }
        if (wrapperDivRef.current != null) {
            const height = wrapperDivRef.current.offsetHeight;
            updateHeight(height);
        }
    }, [onHeightChange, updateHeight]);

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

    const Comp = plugin.fullComponent;
    if (Comp == null) {
        return <div ref={wrapperDivRef}>(no component found in plugin)</div>;
    }

    return (
        <div ref={wrapperDivRef}>
            <Comp model={model} />
        </div>
    );
};