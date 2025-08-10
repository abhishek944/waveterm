import React, { Component, ReactNode } from "react";
import { clsx } from "clsx";

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

interface ErrorBoundaryProps {
    children: ReactNode;
    plugin?: string;
    lineContext?: RendererContext;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = {
        hasError: false,
        error: null,
    };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        const { plugin, lineContext } = this.props;

        if (plugin && lineContext) {
            console.log(`Plugin Name: ${plugin}\n`);
            console.log(`Line Context: \n`);
            console.log(`${JSON.stringify(lineContext, null, 4)}\n`);
        }

        console.log(error);
    }

    resetErrorBoundary = (): void => {
        this.setState({ hasError: false, error: null });
    };

    renderFallback() {
        const { error } = this.state;
        const { plugin } = this.props;

        return (
            <div className={clsx(
                "text-red-500 p-4", 
                plugin ? "text-sm" : "text-base font-medium"
            )}>
                <div>{`${error?.message}`}</div>
                {plugin && <div className="mt-2">An error occurred in the {plugin} plugin</div>}
            </div>
        );
    }

    render() {
        const { hasError } = this.state;

        if (hasError) {
            return this.renderFallback();
        }

        return this.props.children;
    }
}

export { ErrorBoundary };