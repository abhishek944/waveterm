module github.com/abhishek944/waveterm/waveshell

go 1.22

require (
	github.com/abhishek944/waveterm/wavesrv v0.0.0-20240226180630-aeb7195eff05
	github.com/alessio/shellescape v1.4.1
	github.com/creack/pty v1.1.18
	github.com/google/uuid v1.3.0
	golang.org/x/crypto v0.24.0
	golang.org/x/mod v0.10.0
	golang.org/x/sys v0.21.0
	mvdan.cc/sh/v3 v3.7.0
)

require github.com/google/go-cmp v0.6.0 // indirect

replace github.com/abhishek944/waveterm/wavesrv => ../wavesrv
