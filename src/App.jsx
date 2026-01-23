import React, { useState, useEffect } from 'react'
import './App.css'
import { supabase } from './supabase'


const RenderCard = React.memo(function RenderCard({
  item,
  openManualBossId,
  manualHour,
  manualMinute,
  manualError,
  setManualHour,
  setManualMinute,
  setOpenManualBossId,
  setManualError,
  handleManualCutApply,
  addBossCutNow,
  openManualForBoss,
  getBadge,
  getCardClasses,
  getRemainingHuman,
}) {
  const badge = getBadge(item)

  return (
    <div className={getCardClasses(item)}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <div className="font-medium flex items-center gap-2">
            <span>{item.boss_name}</span>
            {item.skippedCycles > 0 && (
              <span className="text-xs text-amber-400/85">멍 {item.skippedCycles}회</span>
            )}
          </div>

          <div className="text-sm text-slate-300 tabular-nums font-mono">
            {new Date(item.adjustedNextMs).toLocaleTimeString()}
            <span className="ml-1 text-slate-400">
              ({getRemainingHuman(item.adjustedNextMs)})
            </span>
          </div>

          {badge.text === "Soon" && (
            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${badge.cls}`}>
              {badge.text}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-2 sm:mt-0 sm:justify-end">
          <button
            onClick={() => addBossCutNow(item.boss)}
            className="rounded bg-sky-600 px-3 py-1 text-sm hover:bg-sky-500 text-white"
          >
            지금 컷
          </button>
          <button
            onClick={() => openManualForBoss(item.boss_id)}
            className="rounded border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800"
          >
            시간 지정 컷
          </button>
        </div>
      </div>

      {openManualBossId === item.boss_id && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2">
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={manualHour}
              onChange={(e) => setManualHour(e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="시"
              className="w-14 rounded bg-slate-800 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            />
            <span>:</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={manualMinute}
              onChange={(e) => setManualMinute(e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="분"
              className="w-14 rounded bg-slate-800 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <button
            onClick={() => handleManualCutApply(item.boss)}
            className="rounded bg-emerald-600 px-3 py-1 text-sm hover:bg-emerald-500 text-white"
          >
            입력
          </button>

          <button
            onClick={() => {
              setOpenManualBossId(null)
              setManualError('')
            }}
            className="rounded border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800"
          >
            취소
          </button>

          {manualError && (
            <div className="text-sm text-red-400">{manualError}</div>
          )}
        </div>
      )}
    </div>
  )
})


function App() {
  // 0) 2배 이벤트 여부 세팅에서 불러오기

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from('boss_cut_settings')
      .select('*')
      .eq('id', 1)
      .single()
    if (error) {
      console.error('settings 에러:', error)
      return
    }
    setIsDoubleEvent(data.is_double_event)
  }

  // 1) 보스 목록 불러오기
  const fetchBossList = async () => {
    const { data, error } = await supabase
      .from('boss_list')
      .select('*')
      .order('id', { ascending: true })

    if (error) {
      console.error('boss_list 에러:', error)
      return
    }
    setBossList(data)
  }

  // 2) 모든 컷 기록 불러오기
  const fetchBossCutList = async () => {
    const { data, error } = await supabase
      .from('boss_cut_list')
      .select('*')
      .order('cut_time', { ascending: false })

    if (error) {
      console.error('boss_cut_list 에러:', error)
      return
    }

    // Supabase에서 오는 row에는 id가 이미 있으니까 그대로 씀
    setBossCutList(data)
  }

  useEffect(() => {
    fetchBossList()
    fetchBossCutList()
    fetchSettings()
  }, [])

  // 첫 리젠 입력

  // A. 서버 오픈 시각을 기준으로 모든 보스의 첫 리젠 기록을 생성하는 함수
  const addInitialCuts = async (serverOpenMs, isDouble) => {
    if (boss_list.length === 0) {
      alert('보스 목록을 불러오는 중입니다. 잠시 후 다시 시도해주세요.')
      return { ok: false, error: 'boss_list_not_loaded' }
    }
    const cutsToInsert = boss_list.map((boss) => {
      // 1. 서버 오픈 시각에 보스별 첫 리젠 시간(분)을 더합니다.
      const firstRespawnMs = serverOpenMs + boss.first_respawn_mins * 60 * 1000;

      // 2. 이 "첫 리젠 시각"이 마치 "이전 컷 시간"인 것처럼 가정하고,
      // 다음 리젠 시간을 계산하는 기존 로직을 재활용합니다.
      // (이 부분이 가장 핵심적인 설계입니다. 첫 리젠 시각은 next_gen_time으로 설정하고,
      // cut_time은 next_gen_time - (respawn_minutes * [이벤트반영]) 으로 역산하여 저장합니다.)

      const baseIntervalMs = boss.respawn_minutes * 60 * 1000
      const intervalMs = baseIntervalMs * (isDouble ? 0.5 : 1)

      // next_gen_time: 서버 오픈 후 첫 리젠 시각
      const nextGenIso = new Date(firstRespawnMs).toISOString();

      // cut_time: 첫 리젠 시각보다 리스폰 주기만큼 이전 시각 (실제 컷이 아닌, 계산의 기준점)
      const cutMs = firstRespawnMs - intervalMs;
      const cutIso = new Date(cutMs).toISOString();

      return {
        boss_id: boss.id,
        boss_name: boss.name,
        cut_time: cutIso,
        next_gen_time: nextGenIso,
      };
    });

    // ⭐ 여기에 콘솔 로그를 추가하여 데이터 확인
    console.log("삽입할 데이터 배열:", cutsToInsert);

    // Supabase에 일괄 삽입
    const { data, error } = await supabase
      .from('boss_cut_list')
      .insert(cutsToInsert)
      .select()

    if (error) {
      console.error('첫 리젠 기록 입력 에러:', error)
      return { ok: false }
    }

    // 로컬 상태 업데이트를 위해 새로 추가된 데이터를 반환
    return { ok: true, newData: data }
  }

  // 3) 컷 입력 (Supabase에 insert)

  // base: 어떤 시각으로 컷했는지(ms)를 인자로 받는 공통 함수
  const addBossCutAt = async (boss, cutMs) => {
    const baseIntervalMs = boss.respawn_minutes * 60 * 1000
    const intervalMs = baseIntervalMs * (isDoubleEvent ? 0.5 : 1)
    const nextMs = cutMs + intervalMs

    // DB에는 timestamptz → ISO string으로 저장
    const cutIso = new Date(cutMs).toISOString()
    const nextIso = new Date(nextMs).toISOString()

    const { data, error } = await supabase
      .from('boss_cut_list')
      .insert([
        {
          boss_id: boss.id,
          boss_name: boss.name,
          cut_time: cutIso,
          next_gen_time: nextIso,
        },
      ])
      .select()

    if (error) {
      console.error('컷 입력 에러:', error)
      return
    }

    // 방금 insert된 행 data[0]을 로컬 state에 추가
    setBossCutList((prev) => [...prev, data[0]])
  }

  const addBossCutNow = (boss) => {
    const nowMs = Date.now()
    addBossCutAt(boss, nowMs)
  }

  const [boss_list, setBossList] = useState([])
  const [boss_cut_list, setBossCutList] = useState([])
  const [isDoubleEvent, setIsDoubleEvent] = useState(false)
  const [tick, setTick] = useState(0)

  // 수동 입력 관련 state
  const [openManualBossId, setOpenManualBossId] = useState(null) // 어떤 보스 카드가 열려있는지
  const [manualHour, setManualHour] = useState('')               // "시"
  const [manualMinute, setManualMinute] = useState('')           // "분"
  const [manualError, setManualError] = useState('')             // 에러 메시지

  const latestByBossId = {} // { 보스id : 특정 컷 입력 } 형태의 객체를 만든다. 나중에 배열로 바꿔줄 예정

  for (const item of boss_cut_list) { // 컷 목록을 순회, 각 컷 입력의 보스id 를 key로 
    const existing = latestByBossId[item.boss_id]

    if (!existing || item.id > existing.id) { // 기존에 없던 보스id 이거나, next_gen_time 이 더 나중이면
      latestByBossId[item.boss_id] = item // 해당 컷 입력을 값으로 할당
    }
  }

  const noCutBossList = boss_list.filter(
    boss => !latestByBossId[boss.id]
  )

  // 남는 시간 계산 함수
  // 남은 시간(미래) / 경과 시간(과거) 표시
  const getRemainingHuman = (nextgenTs) => {
    const nowMs = Date.now()
    const targetMs = new Date(nextgenTs).getTime()
    const diffMs = targetMs - nowMs

    // 미래: 남은 시간
    if (diffMs > 0) {
      const sec = Math.floor(diffMs / 1000)
      const min = Math.floor(sec / 60)
      const hour = Math.floor(min / 60)

      if (hour > 0) return `${hour}시간 ${min % 60}분 남음`
      if (min > 0) return `${min}분 남음`
      return `${sec}초 남음`
    }

    // 과거/현재: 경과 시간 (diffMs <= 0)
    const passedMs = Math.abs(diffMs) // 또는 -diffMs
    const sec = Math.floor(passedMs / 1000)
    const min = Math.floor(sec / 60)
    const hour = Math.floor(min / 60)

    // 방금(예: 5초 이내)은 더 깔끔하게
    if (min < 3) return '방금 리젠됨'

    if (hour > 0) return `${hour}시간 ${min % 60}분 전 리젠됨`
    if (min > 0) return `${min}분 전 리젠됨`
    return `이미 리젠됨 (${sec}초 경과)`
  }


  // 멍 고려한 예상 시각 계산 함수
  const adjustNextGenWithGrace = (nextRaw, respawn_minutes, graceMinutes = 60) => {
    const baseIntervalMs = respawn_minutes * 60 * 1000
    const intervalMs = baseIntervalMs * (isDoubleEvent ? 0.5 : 1)
    const graceMs = graceMinutes * 60 * 1000
    const now = Date.now()

    // nextRaw → ms로 정규화
    const nextMs =
      typeof nextRaw === 'string'
        ? new Date(nextRaw).getTime()
        : nextRaw instanceof Date
          ? nextRaw.getTime()
          : nextRaw

    // 1) 아직 밀 필요 없음
    if (now <= nextMs + graceMs) {
      return {
        adjustedNextMs: nextMs,
        skippedCycles: 0,
      }
    }

    const timePastGrace = now - (nextMs + graceMs)    // 2) grace 이후 얼마나 지났는지
    const skippedCycles = Math.floor(timePastGrace / intervalMs) + 1  // 3) 멍 싸이클 계산
    const adjustedNextMs = nextMs + skippedCycles * intervalMs   // 4) 최종 next

    return {
      adjustedNextMs,
      skippedCycles,
    }

  }

  const latestCutList = Object.values(latestByBossId)

  const latestCutWithAdjusted = latestCutList.map((cut) => {
    const boss = boss_list.find(b => b.id === cut.boss_id)

    // 혹시라도 boss를 못 찾으면 스킵 or 기본 처리
    if (!boss) {
      console.warn('boss_list에서 boss를 찾지 못했습니다.', cut)

      const fallbackMs = new Date(cut.next_gen_time ?? cut.cut_time).getTime()
      return {
        ...cut,
        boss: null,
        adjustedNextMs: fallbackMs,
        skippedCycles: 0,
      }
    }

    const { adjustedNextMs, skippedCycles } = adjustNextGenWithGrace(
      cut.next_gen_time ?? cut.cut_time, // next_gen_time 없으면 cut_time 기준
      boss.respawn_minutes,
      60 // grace 60분
    )

    return {
      ...cut,
      boss,            // 필요하면 같이 붙여두고
      adjustedNextMs,  // 멍/그레이스 반영된 "이번 사이클 next"
      skippedCycles,
    }
  })

  const sortedBossCutList = [...latestCutWithAdjusted].sort(
    (a, b) => a.adjustedNextMs - b.adjustedNextMs
  )

  const nowMs = Date.now()

  const readyList = sortedBossCutList.filter((x) => x.adjustedNextMs <= nowMs)     // 이미 리젠됨
  const upcomingList = sortedBossCutList.filter((x) => x.adjustedNextMs > nowMs)  // 앞으로 예정

  const SOON_MINUTES = 10
  const SOON_MS = SOON_MINUTES * 60 * 1000

  const getCardClasses = (item) => {
    const now = Date.now()
    const isReady = item.adjustedNextMs <= now
    const diff = item.adjustedNextMs - now
    const isSoon = !isReady && diff <= SOON_MS

    // base
    let cls =
      "rounded border px-3 py-2 mb-2 transition-colors"

    // 상태별 톤
    if (isReady) {
      // 리젠됨(과거): 앰버 톤 + 살짝 흐리게
      cls += " bg-slate-900 border-slate-800"
    } else {
      // 예정(미래): 기본 slate
      cls += " bg-slate-900 border-slate-800"
    }

    // 임계값 강조(Soon)
    if (isSoon) {
      // 테두리/배경/링을 조금 더 강하게
      cls += " bg-slate-900 border-slate-800"
    }

    return cls
  }

  const getBadge = (item) => {
    const now = Date.now()
    const isReady = item.adjustedNextMs <= now
    const diff = item.adjustedNextMs - now
    const isSoon = !isReady && diff <= SOON_MS

    if (isReady) return { text: "리젠됨", cls: "text-amber-300 border-amber-700/50 bg-amber-900/20" }
    if (isSoon) return { text: `Soon`, cls: "text-amber-300 border-amber-700/50 bg-amber-900/20" }
    return { text: "예정", cls: "text-slate-200 border-slate-600/50 bg-slate-800/40" }
  }

  // HH:MM 수동 입력 → 어떤 시점의 컷인지(ms)로 변환
  const resolveManualCutMs = (boss, hourStr, minuteStr, nowMs) => {
    // 1) 숫자/범위 검증
    const h = Number(hourStr)
    const m = Number(minuteStr)

    if (
      Number.isNaN(h) || Number.isNaN(m) ||
      !Number.isInteger(h) || !Number.isInteger(m)
    ) {
      return { ok: false, error: '시/분은 숫자로 입력해주세요.' }
    }
    if (h < 0 || h > 23) {
      return { ok: false, error: '시(hour)는 0~23 사이여야 합니다.' }
    }
    if (m < 0 || m > 59) {
      return { ok: false, error: '분(minute)은 0~59 사이여야 합니다.' }
    }

    const intervalMs = boss.respawn_minutes * 60 * 1000

    const now = new Date(nowMs)

    // 오늘 HH:MM
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      h,
      m,
      0,
      0
    ).getTime()

    // 어제 HH:MM
    const yesterday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      h,
      m,
      0,
      0
    ).getTime()


    // 1) 오늘 시간이 미래면, 바로 미래 에러
    if (today > nowMs) {
      return { ok: false, error: '미래 시각은 컷 시간으로 사용할 수 없습니다.' }
    }

    // 2) 오늘/어제 둘 다 후보로 두되, "지나치게 오래된" 것만 필터링
    const candidates = [today, yesterday].filter((ts) => ts <= nowMs)

    // 이론상 여기서 candidates가 비는 일은 거의 없지만, 방어 코드
    if (candidates.length === 0) {
      return { ok: false, error: '유효한 시간 후보를 찾을 수 없습니다.' }
    }

    // 3) 리스폰 주기보다 너무 오래된 값 제거 (1싸이클보다 더 과거면 버림)
    const recentEnough = candidates.filter((ts) => nowMs - ts <= intervalMs)

    if (recentEnough.length === 0) {
      return {
        ok: false,
        error: `너무 오래된 시간입니다. (최대 ${boss.respawn_minutes}분 이내만 입력 가능)`
      }
    }

    // 4) 남은 것 중 가장 최근 값 선택
    const cutMs = Math.max(...recentEnough)

    return { ok: true, cutMs }
  }

  const openManualForBoss = (bossId) => {
    if (openManualBossId === bossId) {
      // 이미 열려있으면 닫기
      setOpenManualBossId(null)
      setManualError('')
      return
    }

    // 새로 열 때: 기본값을 "현재 시각"으로 세팅
    const now = new Date()
    const h = String(now.getHours()).padStart(2, '0')
    const m = String(now.getMinutes()).padStart(2, '0')

    setOpenManualBossId(bossId)
    // setManualHour(h)
    // setManualMinute(m)
    setManualError('')
  }

  const handleManualCutApply = async (boss) => {
    setManualError('')

    const nowMs = Date.now()
    const result = resolveManualCutMs(boss, manualHour, manualMinute, nowMs)

    if (!result.ok) {
      setManualError(result.error)
      return
    }

    await addBossCutAt(boss, result.cutMs)

    // 성공하면 입력창 닫기
    setOpenManualBossId(null)
  }


  const clearAllBossCutsWithMode = async () => {
    const ok = window.confirm('정말 모든 보스 컷 기록을 초기화할까요?\n(되돌릴 수 없습니다)')
    if (!ok) return

    const useNormalMode = window.confirm(
      '초기화 후 사용할 모드를 선택하세요.\n\n[확인] 일반 모드\n[취소] 보스 2배 이벤트 모드'
    )
    const isDouble = !useNormalMode


    const useServerOpen = window.confirm(
      '서버 오픈 시각을 입력하여 첫 리젠 시간을 자동 계산하시겠습니까?\n\n[확인] 서버 오픈 시각 입력\n[취소] 기록 없이 초기화'
    )

    let serverOpenMs = null

    if (useServerOpen) {
      const openTimeStr = window.prompt('서버가 열린 시각을 HH:MM 형식으로 입력해주세요. (예: 10:00)')
      if (!openTimeStr) return

      const [hourStr, minuteStr] = openTimeStr.split(':')
      const h = Number(hourStr)
      const m = Number(minuteStr)
      if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
        alert('잘못된 시각 형식입니다. HH:MM 형식으로 다시 시도해주세요.')
        return
      }

      const now = new Date()
      const serverOpenTimeMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0).getTime()
      serverOpenMs = serverOpenTimeMs > Date.now()
        ? serverOpenTimeMs - 24 * 60 * 60 * 1000
        : serverOpenTimeMs
    }

    // ✅ 1) 항상 먼저 삭제
    const { error: delError } = await supabase.from('boss_cut_list').delete().gt('id', 0)
    if (delError) {
      console.error('전체 초기화 에러:', delError)
      alert('초기화에 실패했습니다.')
      return
    }

    // ✅ 2) 설정 업데이트
    const { error: setError } = await supabase
      .from('boss_cut_settings')
      .update({ is_double_event: isDouble })
      .eq('id', 1)

    if (setError) {
      console.error('settings 업데이트 에러:', setError)
      alert('설정 변경에 실패했습니다.')
      return
    }

    // ✅ 3) (옵션) 그 다음 insert
    let initialCutsData = []
    if (useServerOpen) {
      const result = await addInitialCuts(serverOpenMs, isDouble) // <- 아래 참고
      if (!result.ok) {
        alert('첫 리젠 기록 생성에 실패했습니다. (DB 에러)')
        return
      }
      initialCutsData = result.newData
    }

    await fetchBossCutList()
    await fetchSettings()
    setIsDoubleEvent(isDouble)
  }



  useEffect(() => {
    console.log("전체 보스 컷 목록", boss_cut_list)
    console.log("정렬된 보스 컷 목록", sortedBossCutList)
    console.log("미입력 보스 목록", noCutBossList)
  }, [boss_cut_list, boss_list])

  useEffect(() => {
    // ✅ 수동 입력 중이면 tick 멈춤
    if (openManualBossId !== null) return

    const id = setInterval(() => {
      setTick((t) => t + 1)
    }, 30 * 1000)

    return () => clearInterval(id)
  }, [openManualBossId])






  return (

    <>
      <div className="bg-slate-900 text-slate-50 border-b border-slate-800 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">보스 타이머</h1>
          <span className="text-sm text-slate-400">
            현재 모드:{" "}
            <span className={isDoubleEvent ? "text-emerald-400" : "text-sky-400"}>
              {isDoubleEvent ? "보스 2배 (주기 절반)" : "일반"}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={clearAllBossCutsWithMode}
            className="rounded bg-emerald-600 px-3 py-1 text-sm hover:bg-emerald-500 text-white"
          >
            전체 기록 초기화
          </button>
        </div>
      </div>

      {/* ⬇ tick을 참조만 해서 1분마다 리렌더 유도 */}
      <span className="hidden">{tick}</span>

      <main className="min-h-screen bg-slate-950 text-slate-50 px-4 pb-6">
        <section className="max-w-3xl mx-auto pt-4 space-y-3">
          <h2 className="text-lg font-semibold">보스 리젠 목록</h2>

          {sortedBossCutList.length === 0 && (
            <p className="text-sm text-slate-400">
              등록된 보스 컷 기록이 없습니다.
            </p>
          )}

          {/* 리젠됨 섹션 */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">
                리젠됨 ({readyList.length})
              </h3>
            </div>

            {readyList.length === 0 ? (
              <div className="text-sm text-slate-500">리젠된 보스가 없습니다.</div>
            ) : (
              readyList.map((item) => (
                <RenderCard
                  key={item.id}
                  item={item}
                  openManualBossId={openManualBossId}
                  manualHour={manualHour}
                  manualMinute={manualMinute}
                  manualError={manualError}
                  setManualHour={setManualHour}
                  setManualMinute={setManualMinute}
                  setOpenManualBossId={setOpenManualBossId}
                  setManualError={setManualError}
                  handleManualCutApply={handleManualCutApply}
                  addBossCutNow={addBossCutNow}
                  openManualForBoss={openManualForBoss}
                  getBadge={getBadge}
                  getCardClasses={getCardClasses}
                  getRemainingHuman={getRemainingHuman}
                />

              ))

            )}
          </div>

          {/* 예정 섹션 */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">
                예정 ({upcomingList.length})
              </h3>
            </div>

            {upcomingList.length === 0 ? (
              <div className="text-sm text-slate-500">예정된 보스가 없습니다.</div>
            ) : (
              upcomingList.map((item) => (
                <RenderCard
                  key={item.id}
                  item={item}
                  openManualBossId={openManualBossId}
                  manualHour={manualHour}
                  manualMinute={manualMinute}
                  manualError={manualError}
                  setManualHour={setManualHour}
                  setManualMinute={setManualMinute}
                  setOpenManualBossId={setOpenManualBossId}
                  setManualError={setManualError}
                  handleManualCutApply={handleManualCutApply}
                  addBossCutNow={addBossCutNow}
                  openManualForBoss={openManualForBoss}
                  getBadge={getBadge}
                  getCardClasses={getCardClasses}
                  getRemainingHuman={getRemainingHuman}
                />

              ))

            )}
          </div>



        </section>

        {noCutBossList.length > 0 && (
          <section className="max-w-3xl mx-auto mt-6 space-y-3">
            <h2 className="text-lg font-semibold">미입력 보스 목록</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {noCutBossList.map((boss) => (
                <div
                  key={boss.id}
                  className="flex flex-col justify-between rounded border border-slate-800 bg-slate-900 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="font-medium">{boss.name}</strong>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => addBossCutNow(boss)}
                        className="rounded bg-sky-600 px-3 py-1 text-sm hover:bg-sky-500 text-white"
                      >
                        컷
                      </button>
                      <button
                        onClick={() => openManualForBoss(boss.id)}
                        className="rounded border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800"
                      >
                        시간 컷
                      </button>
                    </div>
                  </div>

                  {openManualBossId === boss.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={manualHour}
                          onChange={(e) => setManualHour(e.target.value)}
                          placeholder="시"
                          min="0"
                          max="23"
                          className="w-14 rounded bg-slate-800 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        <span>:</span>
                        <input
                          type="number"
                          value={manualMinute}
                          onChange={(e) => setManualMinute(e.target.value)}
                          placeholder="분"
                          min="0"
                          max="59"
                          className="w-14 rounded bg-slate-800 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                      <button
                        onClick={() => handleManualCutApply(boss)}
                        className="rounded bg-emerald-600 px-3 py-1 text-sm hover:bg-emerald-500 text-white"
                      >
                        입력
                      </button>
                      <button
                        onClick={() => {
                          setOpenManualBossId(null)
                          setManualError('')
                        }}
                        className="rounded border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800"
                      >
                        취소
                      </button>

                      {manualError && (
                        <div className="text-sm text-red-400">{manualError}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </>




  )
}

export default App
