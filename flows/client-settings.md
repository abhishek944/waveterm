# Client Settings Flow Documentation

This document describes the end-to-end flow for setting and retrieving client settings in Wave Terminal, with a focus on AI provider settings as an example.

## Overview

Client settings in Wave Terminal follow a client-server architecture where:
- The frontend UI collects user input
- Commands are sent to the backend via WebSocket
- The backend validates, stores, and returns updated settings
- The frontend reactively updates based on the new data

## Setting Client Settings Flow

### 1. User Interface Layer

**File**: `src/app/clientsettings/aiproviders.tsx`
- **Component**: `AiProviders` (React component with MobX observer)
- **Method**: `handleProviderChange(provider, key, value)`
  - Triggered when user modifies an API key or setting
  - Builds the new settings object
  - Calls `handleAiOptsChange(newAiOpts)`

**File**: `src/app/clientsettings/clientsettings.tsx`
- **Component**: `ClientSettingsView` 
  - Main settings view that includes `<AiProviders />` component
  - Handles other settings like font size, theme, etc.

### 2. Command Layer

**File**: `src/models/commandrunner.ts`
- **Class**: `CommandRunner`
- **Method**: `setAIOpts(opts: any): Promise<CommandRtnType>`
  ```typescript
  setAIOpts(opts: any): Promise<CommandRtnType> {
      let kwargs: Record<string, string> = { nohist: "1" };
      // Maps UI options to command parameters
      if (opts.default != null) {
          kwargs["defaultprovider"] = opts.default;
      }
      if (opts.gemini?.apitoken != null) {
          kwargs["geminiapitoken"] = opts.gemini.apitoken;
      }
      // ... more mappings
      return GlobalModel.submitCommand("client", "set", null, kwargs, false);
  }
  ```

### 3. Model Layer

**File**: `src/models/model.ts`
- **Class**: `Model`
- **Method**: `submitCommand(metaCmd, metaSubCmd, args, kwargs, interactive)`
  - Creates a command packet
  - Sends via WebSocket: `this.ws.pushMessage(pk)`
  - Returns a promise that resolves with the command result

### 4. WebSocket Communication

**File**: `src/models/ws.ts`
- Handles WebSocket connection to the backend
- Sends command packets as JSON
- Receives updates and command responses

### 5. Backend Command Processing

**File**: `wavesrv/pkg/cmdrunner/cmdrunner.go`
- **Function**: `ClientSetCommand(ctx context.Context, pk *scpacket.FeCommandPacketType)`
  - Validates input parameters
  - Updates specific settings based on parameter names:
    ```go
    if defaultProvider, found := pk.Kwargs["defaultprovider"]; found {
        clientData.ClientOpts.AIProvider = defaultProvider
        clientData.AIChats.LLMProvider = defaultProvider
        // Update AIOptions
    }
    if geminiApiToken, found := pk.Kwargs["geminiapitoken"]; found {
        // Validate and store Gemini API token
    }
    ```

### 6. Database Layer

**File**: `wavesrv/pkg/sstore/dbops.go`
- **Function**: `UpdateClientAIOpts(ctx context.Context, aiOpts interface{}) error`
  ```go
  func UpdateClientAIOpts(ctx context.Context, aiOpts interface{}) error {
      clientId := getClientId(ctx)
      query := `UPDATE client SET aiopts = ? WHERE clientid = ?`
      aiOptsBytes, _ := json.Marshal(aiOpts)
      return WithTx(ctx, func(tx *TxWrap) error {
          tx.Exec(query, aiOptsBytes, clientId)
          return nil
      })
  }
  ```

### 7. Response Flow

1. Backend creates update packet with new client data
2. Sends via WebSocket to frontend
3. Frontend receives update in `Model.runUpdate_internal()`
4. Update is processed based on type:
   ```typescript
   else if (update.clientdata != null) {
       this.setClientData(update.clientdata);
   }
   ```

### 8. Frontend State Update

**File**: `src/models/model.ts`
- **Method**: `setClientData(clientData: ClientDataType)`
  ```typescript
  setClientData(clientData: ClientDataType) {
      mobx.action(() => {
          this.clientData.set(clientData);
          // Additional processing for themes, fonts, etc.
      })();
  }
  ```

### 9. UI Re-render

- MobX `@observer` decorator on components causes automatic re-render
- Components access updated data via `GlobalModel.clientData.get()`
- New values are displayed (masked for sensitive data like API keys)

## Retrieving Client Settings Flow

### 1. Initial Load

**File**: `src/models/model.ts`
- **Method**: `initClientData()`
  - Called during app initialization
  - Makes HTTP request to `/api/get-client-data`
  - Calls `setClientData()` with response

### 2. Accessing Settings in Components

**File**: `src/app/clientsettings/aiproviders.tsx`
```typescript
render() {
    const cdata: ClientDataType = GlobalModel.clientData.get();
    const aiOpts = cdata.aiopts ?? {};
    // Use settings to render UI
}
```

### 3. Global Access

Any component can access client settings via:
```typescript
const clientData = GlobalModel.clientData.get();
const fontSize = clientData?.feopts?.termfontsize;
const aiProvider = clientData?.clientopts?.aiprovider;
```

## Key Data Structures

### ClientDataType (Frontend)
```typescript
interface ClientDataType {
    clientid: string;
    clientopts?: ClientOptsType;
    aiopts?: AIOptsType;
    feopts?: FeOptsType;
    // ... other fields
}
```

### AIOptsType
```typescript
interface AIOptsType {
    default?: string;  // "openai" | "gemini" | "azure"
    openai?: { apitoken?: string };
    gemini?: { apitoken?: string };
    azure?: { 
        apitoken?: string;
        baseurl?: string;
        deploymentname?: string;
    };
}
```

## Error Handling

1. **Frontend Validation**: Basic validation in UI components
2. **Backend Validation**: 
   - Token format validation
   - Required field checks
   - Returns error in command response
3. **Error Display**: Via `commandRtnHandler()` utility function

## Security Considerations

1. **API Key Masking**: Frontend displays only last 4 characters
2. **No Logging**: Sensitive values are not logged
3. **Secure Storage**: Stored in local SQLite database
4. **WebSocket Security**: Commands sent over secure WebSocket connection

## Common Issues and Debugging

1. **Settings not persisting**: Check if backend handler exists for the parameter name
2. **UI not updating**: Ensure component is wrapped with `@observer`
3. **Validation errors**: Check backend validation logic in `ClientSetCommand`
4. **Database errors**: Check `dbops.go` for proper SQL queries

## Adding New Settings

1. Add field to `ClientDataType` or relevant sub-type
2. Update `CommandRunner` to include new parameter in kwargs
3. Add handler in `ClientSetCommand` for the new parameter
4. Update database operations if needed
5. Add UI component to collect the setting
6. Ensure component uses `@observer` for reactive updates