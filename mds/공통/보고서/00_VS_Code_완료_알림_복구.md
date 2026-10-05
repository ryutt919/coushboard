# VS Code의 Codex와 Claude 완료 알림 복구

## Task Metadata

- **작성 및 갱신 시각**: 2026-10-05 15:42:20 KST
- **사용 모델**: `gpt-6`
- **사용자 요구사항**: Windows에서 VS Code 알림을 켰는데 Codex와 Claude 작업 완료 알림이 오지 않는 원인을 조사하고 알림을 받도록 수정한다. 작업 현황도 보고한다.
- **버전**: 공통, 개발 환경 알림 도구 `v1`, 앱 결과 버전과 독립

## 결과

- **복구 완료**: 실제 프로그램의 완료 이벤트로 Windows 배너를 보내고 사용자가 수신을 확인했다.
- 적용 범위: 이 PC의 로컬 Codex와 Claude 사용자 전역 설정.
- 알림 제목: `Codex 작업 완료`, `Claude 작업 완료`.
- 내용: 작업 폴더 이름과 VS Code에서 결과 확인 안내.
- 전경 및 배경 모두 전송하며 Windows 기본 알림 소리를 요청한다.
- 응답 본문과 사용자 프롬프트는 배너에 포함하지 않는다.

## 원인과 근거

- Windows 전달 경로는 정상이다.
  - `WpnService`, `WpnUserService_1f7008` 실행 중.
  - `HKCU/Software/Microsoft/Windows/CurrentVersion/PushNotifications`의 `ToastEnabled=1`.
  - Windows API의 `CreateToastNotifier('Microsoft.VisualStudioCode').Setting=Enabled`.
  - VS Code 내부 알림 필터에서 `openai.chatgpt`, `Anthropic.claude-code` 모두 `filter=0`.
  - 전역 방해 금지 활성 값은 없으며 테스트 배너의 실제 수신도 확인했다.
- Codex IDE 기본 완료 알림이 없다.
  - 설치된 `openai.chatgpt`의 확장 host에 Windows 완료 알림 송신 경로가 없다.
  - 공용 `notifications-turn-mode` 스키마는 데스크톱 설정이며 IDE 완료 알림 설정으로 사용할 수 없다.
  - 기존 `notify`는 `codex-computer-use.exe turn-ended`에만 연결돼 있었다.
  - 공식 문서는 IDE의 완료 알림에 연결된 호스트의 `notify`를 사용하도록 안내한다.
- Claude 기본 완료 알림과 사용자 훅이 없다.
  - 설치된 Claude 확장은 권한 요청 등을 VS Code 메시지로 전달하지만 완료 `result`에서는 알림을 호출하지 않는다.
  - 사용자 설정의 `Stop` 훅이 없었고 확장 로그에도 등록 훅 0개가 기록돼 있었다.

## 변경

- `%USERPROFILE%/.codex/config.toml`
  - `notify`를 Python 알림 스크립트로 연결했다.
  - 기존 명령과 인수는 로컬 `runtime.json`에 보관하고 실제 완료 시 먼저 실행한다.
  - 기존 명령 실패도 로그로 기록하고 독립적인 Windows 알림을 전송한다.
- `%USERPROFILE%/.claude/settings.json`
  - `hooks.Stop` 명령 하나를 추가했다.
  - 하위 에이전트 종료가 아닌 주 에이전트의 응답 종료에 연결한다.
  - 진행 중인 배경 작업 또는 예약 작업이 있으면 완료 배너를 생략하고 로그를 남긴다.
- 실행 파일
  - [05_notify_completion.py](../../../scripts/05_notify_completion.py): 이벤트 입력, 기존 Codex 명령 보존, 실패 및 전송 로그.
  - [06_show_completion_toast.ps1](../../../scripts/06_show_completion_toast.ps1): 기존 VS Code 앱 식별자로 Windows 네이티브 toast 전송.
  - [07_configure_completion_notifications.py](../../../scripts/07_configure_completion_notifications.py): 설치, 설정 백업, 중복 등록 방지.
  - 실행용 사본은 `%LOCALAPPDATA%/VSCodeAgentNotifications/scripts/`에 둔다.
  - Windows PowerShell 5.1의 한글 해석을 위해 설치 사본에 UTF-8 BOM을 사용한다.
- 설정 보존
  - Codex의 `notify`를 제외한 TOML 값과 Claude의 새 `hooks`를 제외한 JSON 값이 원본 백업과 동일함을 검증했다.
  - 재설치해도 Claude Stop 훅은 하나로 유지된다.
  - 실행용 Python과 PowerShell 사본이 저장소의 원본 내용과 동일함을 확인했다.

## 검증

- 설치 버전
  - VS Code `1.140.0`.
  - Codex 설치 최신 `26.930.51102`, 현재 VS Code 호스트 프로세스는 `26.930.41038`.
  - Claude Code `2.1.289`.
- 15:37:51, 15:37:52 KST: 합성 Codex와 Claude 이벤트로 전송 성공.
- 15:39:13 KST: 현재 VS Code가 사용하는 Codex 바이너리의 app-server에서 실제 테스트 응답 완료 후 전송 성공.
  - JSON-RPC `initialize`, `thread/start`, `turn/start`, `turn/completed`를 사용했다.
  - 임시 스레드, 읽기 전용 샌드박스, 도구 사용과 파일 수정 없는 `OK` 응답으로 검증했다.
  - 기존 Codex 완료 명령도 종료 코드 0으로 실행됐다.
- 15:39:21 KST: Claude `--print`의 실제 `OK` 응답 후 등록된 Stop 훅이 전송했다.
  - 사용자 설정을 로드하고 도구와 세션 저장은 끈 테스트였다.
- 사용자 확인: 진단 배너와 후속 자동 알림이 왔다고 직접 응답했다.
- Windows API 알림 기록에도 각 전송의 태그와 `ai-completion` 그룹이 등록됐다.

## 재현과 복구

- 설치 재현: 프로젝트 루트에서 `python scripts/07_configure_completion_notifications.py`.
- 로그: `%LOCALAPPDATA%/VSCodeAgentNotifications/logs/events.jsonl`.
- 실제 테스트 근거: `%LOCALAPPDATA%/VSCodeAgentNotifications/validation/`의 `codex-result.json`, `claude-result.json`, `claude-hook-debug.log`, `codex-app-server.stderr.log`.
- 원본 설정 백업: `%LOCALAPPDATA%/VSCodeAgentNotifications/backups/20261005_153749/`.
- 복구 방법
  - 백업 `config.toml`의 원래 `notify`만 현재 Codex 설정에 복원한다.
  - Claude `hooks.Stop`에서 `05_notify_completion.py --source Claude` 연결만 제거한다.
  - 설정 전체 백업 복원은 이후 다른 설정 변경이 없을 때만 사용한다.
- 실행 스크립트는 프로젝트 경로에 의존하지 않아 프로젝트 폴더를 옮겨도 설치된 연결은 유지된다.

## 한계와 적용 안내

- 현재 실행 중인 Codex 스레드는 시작할 때 이전 설정을 로드했을 수 있다. **새 대화부터 적용**하는 것이 확실하며 필요하면 기존 작업 종료 후 VS Code 창을 다시 로드한다.
- 응답 완료 알림은 전체 프로젝트 성공 보증이 아니다. 결과 검토는 VS Code에서 수행한다.
- Windows 방해 금지 또는 소리 설정을 나중에 변경하면 표시와 소리에 영향을 줄 수 있다. 이번 테스트에서는 배너 표시가 확인됐다.
- 원격 SSH, WSL의 별도 사용자 홈, 다른 PC는 해당 호스트 설정과 Windows 전달 연결을 별도로 구성해야 한다.
- 등록한 프로그램 경로나 Python 설치를 삭제하면 로그 및 연결을 확인하고 재설치해야 한다.

## 공식 근거

- [Codex 알림](https://learn.chatgpt.com/docs/notifications): IDE 완료 이벤트와 외부 `notify` 연결.
- [Codex 고급 설정](https://learn.chatgpt.com/docs/config-file/config-advanced#notifications): 단일 JSON 인수, `agent-turn-complete` 이벤트.
- [Claude Stop 훅](https://code.claude.com/docs/en/hooks#stop): 주 에이전트 응답 종료, 사용자 중단 제외.
- [Claude 훅 안내](https://code.claude.com/docs/en/hooks-guide): 사용자 설정을 통한 알림 자동화.

## Change History

| 시각 | 모델 | 사용자 요구사항 | 작업 | 변경 요약 |
|---|---|---|---|---|
| 2026-10-05 15:42:20 KST | `gpt-6` | VS Code Codex와 Claude 완료 알림 복구, 현황 보고 | 원인 규명과 알림 연결 | 미연결 상태 → 전역 notify와 Stop Windows toast 연결, 실제 완료와 수신 검증 |
