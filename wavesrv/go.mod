module github.com/abhishek944/waveterm/wavesrv

go 1.22

toolchain go1.22.0

require (
	github.com/abhishek944/waveterm/waveshell v0.0.0
	github.com/alessio/shellescape v1.4.1
	github.com/armon/circbuf v0.0.0-20190214190532-5111143e8da2
	github.com/creack/pty v1.1.18
	github.com/fsnotify/fsnotify v1.6.0
	github.com/golang-migrate/migrate/v4 v4.16.2
	github.com/google/generative-ai-go v0.5.0
	github.com/google/go-github/v60 v60.0.0
	github.com/google/uuid v1.6.0
	github.com/gorilla/mux v1.8.0
	github.com/gorilla/websocket v1.5.0
	github.com/jmoiron/sqlx v1.3.5
	github.com/kevinburke/ssh_config v1.2.0
	github.com/mattn/go-sqlite3 v1.14.16
	github.com/openai/openai-go/v2 v2.0.0
	github.com/sawka/txwrap v0.1.2
	github.com/skeema/knownhosts v1.3.0
	golang.org/x/crypto v0.32.0
	golang.org/x/mod v0.17.0
	golang.org/x/sys v0.29.0
	google.golang.org/api v0.152.0
	mvdan.cc/sh/v3 v3.7.0
)

require (
	cloud.google.com/go/ai v0.3.0 // indirect
	cloud.google.com/go/compute v1.23.3 // indirect
	cloud.google.com/go/compute/metadata v0.2.3 // indirect
	cloud.google.com/go/longrunning v0.5.4 // indirect
	github.com/Azure/azure-sdk-for-go/sdk/azcore v1.17.0 // indirect
	github.com/Azure/azure-sdk-for-go/sdk/internal v1.10.0 // indirect
	github.com/golang/groupcache v0.0.0-20210331224755-41bb18bfe9da // indirect
	github.com/golang/protobuf v1.5.3 // indirect
	github.com/google/go-querystring v1.1.0 // indirect
	github.com/google/s2a-go v0.1.7 // indirect
	github.com/googleapis/enterprise-certificate-proxy v0.3.2 // indirect
	github.com/googleapis/gax-go/v2 v2.12.0 // indirect
	github.com/hashicorp/errwrap v1.1.0 // indirect
	github.com/hashicorp/go-multierror v1.1.1 // indirect
	github.com/tidwall/gjson v1.14.4 // indirect
	github.com/tidwall/match v1.1.1 // indirect
	github.com/tidwall/pretty v1.2.1 // indirect
	github.com/tidwall/sjson v1.2.5 // indirect
	go.opencensus.io v0.24.0 // indirect
	go.uber.org/atomic v1.7.0 // indirect
	golang.org/x/net v0.34.0 // indirect
	golang.org/x/oauth2 v0.14.0 // indirect
	golang.org/x/sync v0.10.0 // indirect
	golang.org/x/text v0.21.0 // indirect
	golang.org/x/time v0.5.0 // indirect
	google.golang.org/appengine v1.6.7 // indirect
	google.golang.org/genproto v0.0.0-20231106174013-bbf56f31fb17 // indirect
	google.golang.org/genproto/googleapis/api v0.0.0-20231106174013-bbf56f31fb17 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20231120223509-83a465c0220f // indirect
	google.golang.org/grpc v1.59.0 // indirect
	google.golang.org/protobuf v1.31.0 // indirect
)

replace github.com/abhishek944/waveterm/waveshell => ../waveshell

replace github.com/kevinburke/ssh_config => github.com/wavetermdev/ssh_config v0.0.0-20240306041034-17e2087ebde2
