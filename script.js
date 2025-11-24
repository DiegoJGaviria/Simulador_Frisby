// ============================================
// SIMULACIÓN DE SISTEMA DE COLAS G/G/1
// ============================================

class QueueSimulation {
  constructor() {
    this.arrivalMean = 98.6
    this.arrivalStd = 127.02
    this.serviceMean = 91.64
    this.serviceStd = 43.76

    this.isRunning = false
    this.isPaused = false
    this.currentTime = 0
    this.speedMultiplier = 1
    this.animationFrameId = null

    // Datos del sistema
    this.queue = []
    this.serverBusy = false
    this.clientServing = null
    this.serviceEndTime = 0

    // Estadísticas
    this.arrivedCount = 0
    this.servedCount = 0
    this.clientsHistory = []
    this.maxQueueLength = 0
    this.busyTime = 0
    this.totalObservedTime = 0
    this.startSimTime = 0
    this.startRealTime = null

    // Próximos eventos
    this.nextArrivalTime = this.generateArrivalTime()
    this.lastEventTime = 0
    // Control de duración (segundos) y finalización automática
    this.simulationDurationSeconds = 0
    this.endSimTime = null

    // Elementos DOM
    this.elements = {
      startBtn: document.getElementById("startBtn"),
      pauseBtn: document.getElementById("pauseBtn"),
      resetBtn: document.getElementById("resetBtn"),
      speedControl: document.getElementById("speedControl"),
      speedLabel: document.getElementById("speedLabel"),
      speedInput: document.getElementById("speedInput"),
      animationToggle: document.getElementById("animationToggle"),
      simMin: document.getElementById("simMin"),
      simSec: document.getElementById("simSec"),
      stopAtTime: document.getElementById("stopAtTime"),
      queueBox: document.getElementById("queueBox"),
      serverBox: document.getElementById("serverBox"),
      clientServing: document.getElementById("clientServing"),
      timeRemaining: document.getElementById("timeRemaining"),
      arrivedCount: document.getElementById("arrivedCount"),
      servedCount: document.getElementById("servedCount"),
      simTime: document.getElementById("simTime"),
      estimatedTime: document.getElementById("estimatedTime"),
      lq: document.getElementById("lq"),
      wq: document.getElementById("wq"),
      ls: document.getElementById("ls"),
      ws: document.getElementById("ws"),
      rho: document.getElementById("rho"),
      p0: document.getElementById("p0"),
      logBox: document.getElementById("logBox"),
      clearLogBtn: document.getElementById("clearLogBtn"),
      finalResults: document.getElementById("finalResults"),
    }

    this.validateElements()
    this.initializeEventListeners()
    this.addLog("Sistema listo. Basado en análisis G/G/1 de Frisby.", "initial")
  }

  // ============ VALIDACIÓN DE ELEMENTOS ============
  validateElements() {
    const missing = Object.entries(this.elements)
      .filter(([key, el]) => !el)
      .map(([key]) => key)
    
    if (missing.length > 0) {
      console.warn("⚠️ Elementos DOM faltantes:", missing)
    }
  }

  // ============ GENERADORES DE NÚMEROS ALEATORIOS ============

  generateLognormal(mean, std) {
    const cv = std / mean
    const mu = Math.log(mean / Math.sqrt(1 + cv * cv))
    const sigma = Math.sqrt(Math.log(1 + cv * cv))

    const u1 = Math.random()
    const u2 = Math.random()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)

    return Math.exp(mu + sigma * z)
  }

  generateArrivalTime() {
    return this.generateLognormal(this.arrivalMean, this.arrivalStd)
  }

  generateServiceTime() {
    return this.generateLognormal(this.serviceMean, this.serviceStd)
  }

  // ============ CONTROL DE SIMULACIÓN ============

  start() {
    try {
      if (this.isRunning && !this.isPaused) return // Ya está corriendo

      // Leer duración configurada por el usuario
      let durationSec = 0
      if (this.elements.simMin) durationSec += Math.max(0, parseInt(this.elements.simMin.value || '0', 10)) * 60
      if (this.elements.simSec) durationSec += Math.max(0, parseInt(this.elements.simSec.value || '0', 10))
      this.simulationDurationSeconds = durationSec

      this.isRunning = true
      this.isPaused = false
      this.startSimTime = Date.now()
      // Registrar tiempo real de inicio
      this.startRealTime = Date.now()

      // Si el usuario desea detener al completar el tiempo
      if (this.elements.stopAtTime && this.elements.stopAtTime.checked) {
        if (this.simulationDurationSeconds > 0) {
          this.endSimTime = this.currentTime + this.simulationDurationSeconds
          this.addLog(`Duración establecida: ${this.formatTime(this.simulationDurationSeconds)} — se detendrá automáticamente`, "info")
          if (this.elements.finalResults) this.elements.finalResults.style.display = "none"
        } else {
          // Permitir iniciar aunque la duración sea 0: no se detendrá automáticamente
          this.endSimTime = null
          this.addLog(`La opción "Detener al completar tiempo" está activa pero la duración es 0s; la simulación no se detendrá automáticamente.`, "info")
        }
      } else {
        this.endSimTime = null
      }

      if (this.elements.startBtn) this.elements.startBtn.disabled = true
      if (this.elements.pauseBtn) this.elements.pauseBtn.disabled = false
      if (this.elements.pauseBtn) this.elements.pauseBtn.textContent = "Pausar"

      this.addLog("Simulación iniciada con velocidad " + this.speedMultiplier + "x", "info")
      this.simulate()
    } catch (err) {
      console.error(err)
      this.addLog(`Error al iniciar la simulación: ${err?.message || err}`, "error")
      if (this.elements.startBtn) this.elements.startBtn.disabled = false
    }
  }

  pause() {
    if (!this.isRunning) return

    this.isPaused = !this.isPaused
    if (this.isPaused) {
      if (this.elements.pauseBtn) this.elements.pauseBtn.textContent = "Reanudar"
      this.addLog("Simulación pausada", "info")
      if (this.animationFrameId) {
        clearTimeout(this.animationFrameId)
      }
    } else {
      if (this.elements.pauseBtn) this.elements.pauseBtn.textContent = "Pausar"
      this.addLog("Simulación reanudada", "info")
      this.simulate()
    }
  }

  reset() {
    this.isRunning = false
    this.isPaused = false
    this.currentTime = 0
    this.queue = []
    this.serverBusy = false
    this.clientServing = null
    this.arrivedCount = 0
    this.servedCount = 0
    this.clientsHistory = []
    this.maxQueueLength = 0
    this.busyTime = 0
    this.totalObservedTime = 0
    this.nextArrivalTime = this.generateArrivalTime()
    this.lastEventTime = 0
    this.startSimTime = 0
    this.startRealTime = null
    this.endSimTime = null

    if (this.animationFrameId) {
      clearTimeout(this.animationFrameId)
    }

    if (this.elements.startBtn) this.elements.startBtn.disabled = false
    if (this.elements.pauseBtn) {
      this.elements.pauseBtn.disabled = true
      this.elements.pauseBtn.textContent = "Pausar"
    }

    this.updateUI()
    if (this.elements.logBox) {
      this.elements.logBox.innerHTML = '<div class="log-entry initial">Simulación reiniciada. Lista para iniciar...</div>'
    }
    if (this.elements.finalResults) {
      this.elements.finalResults.style.display = "none"
      this.elements.finalResults.innerHTML = ""
    }
    this.addLog("Sistema reiniciado", "info")
  }

  // ============ CÁLCULO DE TIEMPO ESTIMADO ============

  calculateEstimatedTime(targetClients = 100) {
    // Aproximación: tiempo total = (clientes * promedio entre llegadas) + (clientes * servicio promedio)
    // Dividido por la velocidad de simulación
    const avgArrival = this.arrivalMean
    const avgService = this.serviceMean
    const totalSimTime = (targetClients * (avgArrival + avgService)) / this.speedMultiplier
    return totalSimTime
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${String(secs).padStart(2, "0")}`
  }

  // ============ SIMULACIÓN DISCRETA DE EVENTOS ============

  simulate() {
    if (!this.isRunning || this.isPaused) return

    const processEvents = () => {
      if (!this.isRunning || this.isPaused) return

      // Generar 5-10 eventos por frame según velocidad
      const eventsPerFrame = Math.max(1, Math.floor(this.speedMultiplier * 5))

      for (let i = 0; i < eventsPerFrame; i++) {
        if (!this.isRunning || this.isPaused) break

        // Determinar próximo evento
        let nextEventTime = this.nextArrivalTime
        let eventType = "arrival"

        if (this.serverBusy && this.serviceEndTime < nextEventTime) {
          nextEventTime = this.serviceEndTime
          eventType = "departure"
        }

        // Avanzar tiempo
        this.lastEventTime = this.currentTime
        this.currentTime = nextEventTime

        // Procesar evento
        if (eventType === "arrival") {
          this.processArrival()
        } else {
          this.processDeparture()
        }

        // Verificar si alcanzamos el tiempo objetivo de simulación
        if (this.endSimTime !== null && this.currentTime >= this.endSimTime) {
          this.addLog("Tiempo de simulación alcanzado. Finalizando...", "info")
          this.finishSimulation()
          return
        }
      }

      this.updateUI()

      // Continuar si sigue corriendo
      if (this.isRunning && !this.isPaused) {
        const delay = Math.max(16, 100 / this.speedMultiplier)
        this.animationFrameId = setTimeout(processEvents, delay)
      }
    }

    processEvents()
  }

  processArrival() {
    this.arrivedCount++
    const clientId = this.arrivedCount
    const arrivalTime = this.currentTime

    this.addLog(`Arribo cliente #${clientId} en t=${this.formatTime(this.currentTime)}`, "arrival")

    if (!this.serverBusy) {
      // Servidor disponible
      this.serverBusy = true
      this.clientServing = clientId
      const serviceTime = this.generateServiceTime()
      this.serviceEndTime = this.currentTime + serviceTime

      this.addLog(`Cliente #${clientId} inicia servicio (${serviceTime.toFixed(1)}s)`, "start")
    } else {
      // Agregar a cola
      this.queue.push({
        id: clientId,
        arrivalTime: arrivalTime,
      })

      if (this.queue.length > this.maxQueueLength) {
        this.maxQueueLength = this.queue.length
      }

      this.addLog(`Cliente #${clientId} entra en cola (len: ${this.queue.length})`, "info")
    }

    this.nextArrivalTime = this.currentTime + this.generateArrivalTime()
  }

  processDeparture() {
    const clientId = this.clientServing
    const serviceTime = this.serviceEndTime - this.currentTime

    this.servedCount++
    this.busyTime += serviceTime

    this.addLog(`Cliente #${clientId} termina servicio en t=${this.formatTime(this.currentTime)}`, "departure")

    if (this.queue.length > 0) {
      // Siguiente cliente
      const nextClient = this.queue.shift()
      const waitTime = this.currentTime - nextClient.arrivalTime
      const newServiceTime = this.generateServiceTime()
      const systemTime = waitTime + newServiceTime

      this.clientsHistory.push({
        id: nextClient.id,
        arrivalTime: nextClient.arrivalTime,
        waitTime: waitTime,
        systemTime: systemTime,
      })

      this.clientServing = nextClient.id
      this.serviceEndTime = this.currentTime + newServiceTime

      this.addLog(`Cliente #${nextClient.id} inicia servicio (esperó ${waitTime.toFixed(1)}s)`, "start")
    } else {
      // Servidor ocioso
      this.serverBusy = false
      this.clientServing = null
      this.addLog("Servidor queda ocioso", "info")
    }

    this.totalObservedTime = this.currentTime
  }

  // ============ ACTUALIZACIÓN DE UI ============

  updateUI() {
    this.updateQueueDisplay()
    this.updateServerDisplay()
    this.updateClientInfo()
    this.updateMetrics()
  }

  updateQueueDisplay() {
    const queueBox = this.elements.queueBox
    queueBox.innerHTML = ""

    if (this.queue.length === 0) {
      queueBox.innerHTML = '<div class="queue-placeholder">Vacía</div>'
    } else {
      this.queue.forEach((client) => {
        const div = document.createElement("div")
        div.className = "client-item"
        const waitTime = this.currentTime - client.arrivalTime
        div.textContent = `#${client.id} (espera: ${waitTime.toFixed(1)}s)`
        queueBox.appendChild(div)
      })
    }
  }

  updateServerDisplay() {
    const serverBox = this.elements.serverBox
    const statusDiv = serverBox.querySelector(".server-status")

    if (this.serverBusy && this.clientServing) {
      statusDiv.className = "server-status busy"
      statusDiv.innerHTML = '<div class="status-label">EN ATENCIÓN</div>'
      const timeRemaining = Math.max(0, this.serviceEndTime - this.currentTime)
      this.elements.timeRemaining.textContent = timeRemaining.toFixed(1)
      this.elements.clientServing.textContent = `#${this.clientServing}`
    } else {
      statusDiv.className = "server-status idle"
      statusDiv.innerHTML = '<div class="status-label">Disponible</div>'
      this.elements.timeRemaining.textContent = "--"
      this.elements.clientServing.textContent = "--"
    }
  }

  updateClientInfo() {
    if (this.elements.arrivedCount) this.elements.arrivedCount.textContent = this.arrivedCount
    if (this.elements.servedCount) this.elements.servedCount.textContent = this.servedCount
    if (this.elements.simTime) this.elements.simTime.textContent = this.formatTime(this.currentTime)
    // Mostrar tiempo real transcurrido desde que se inició la simulación
    if (this.elements.realTime) {
      let realSec = 0
      if (this.startRealTime) {
        realSec = (Date.now() - this.startRealTime) / 1000
      }
      this.elements.realTime.textContent = this.formatTime(realSec)
    }
    
    // Mostrar tiempo estimado si aún no ha terminado
    if (this.isRunning && this.elements.estimatedTime) {
      const estimated = this.calculateEstimatedTime(this.arrivedCount + 50)
      this.elements.estimatedTime.textContent = this.formatTime(estimated)
    }
  }

  updateMetrics() {
    let Lq = 0
    let Wq = 0
    let Ls = 0
    let Ws = 0

    if (this.clientsHistory.length > 0) {
      const totalWaitTime = this.clientsHistory.reduce((sum, c) => sum + c.waitTime, 0)
      const totalSystemTime = this.clientsHistory.reduce((sum, c) => sum + c.systemTime, 0)

      Wq = totalWaitTime / this.clientsHistory.length
      Ws = totalSystemTime / this.clientsHistory.length
      Lq = (Wq * this.arrivedCount) / Math.max(1, this.totalObservedTime)
      Ls = (Ws * this.arrivedCount) / Math.max(1, this.totalObservedTime)
    }

    Ls += this.serverBusy ? 1 : 0

    const rho = this.totalObservedTime > 0 ? (this.busyTime / this.totalObservedTime) * 100 : 0
    const p0 = Math.max(0, 100 - rho)

    this.elements.lq.textContent = Lq.toFixed(2)
    this.elements.wq.textContent = Wq.toFixed(2)
    this.elements.ls.textContent = Ls.toFixed(2)
    this.elements.ws.textContent = Ws.toFixed(2)
    this.elements.rho.textContent = rho.toFixed(2)
    this.elements.p0.textContent = p0.toFixed(2)
  }

  // ============ FINALIZACIÓN Y UTILIDADES ============

  finishSimulation() {
    // Detener simulación y mostrar resumen
    this.isRunning = false
    if (this.animationFrameId) clearTimeout(this.animationFrameId)
    if (this.elements.startBtn) this.elements.startBtn.disabled = false
    if (this.elements.pauseBtn) this.elements.pauseBtn.disabled = true

    // Calcular métricas finales
    const totalArrived = this.arrivedCount
    const totalServed = this.servedCount
    const maxQueue = this.maxQueueLength
    const avgWait = this.clientsHistory.length ? (this.clientsHistory.reduce((s, c) => s + c.waitTime, 0) / this.clientsHistory.length) : 0
    const avgSys = this.clientsHistory.length ? (this.clientsHistory.reduce((s, c) => s + c.systemTime, 0) / this.clientsHistory.length) : 0
    const rho = this.totalObservedTime > 0 ? (this.busyTime / this.totalObservedTime) * 100 : 0

    const summary = `Llegados: ${totalArrived}, Atendidos: ${totalServed}, Cola máxima: ${maxQueue}, Espera promedio: ${avgWait.toFixed(2)}s, Tiempo sistema promedio: ${avgSys.toFixed(2)}s, Utilización: ${rho.toFixed(2)}%`
    this.addLog(`Resumen final — ${summary}`, "info")

    // Actualizar contadores y métricas visibles en el panel "Métricas del Sistema"
    try {
      if (this.elements.arrivedCount) this.elements.arrivedCount.textContent = String(totalArrived)
      if (this.elements.servedCount) this.elements.servedCount.textContent = String(totalServed)
      if (this.elements.simTime) this.elements.simTime.textContent = this.formatTime(this.currentTime)

      // Forzar recálculo de métricas y obtener valores numéricos
      let Lq = 0
      let Wq = 0
      let Ls = 0
      let Ws = 0

      if (this.clientsHistory.length > 0) {
        const totalWaitTime = this.clientsHistory.reduce((sum, c) => sum + c.waitTime, 0)
        const totalSystemTime = this.clientsHistory.reduce((sum, c) => sum + c.systemTime, 0)

        Wq = totalWaitTime / this.clientsHistory.length
        Ws = totalSystemTime / this.clientsHistory.length
        Lq = (Wq * this.arrivedCount) / Math.max(1, this.totalObservedTime)
        Ls = (Ws * this.arrivedCount) / Math.max(1, this.totalObservedTime)
      }

      Ls += this.serverBusy ? 1 : 0
      const rhoPct = this.totalObservedTime > 0 ? (this.busyTime / this.totalObservedTime) * 100 : 0
      const p0Pct = Math.max(0, 100 - rhoPct)

      // Volcar valores en el DOM exactamente como lo hace updateMetrics()
      if (this.elements.lq) this.elements.lq.textContent = Lq.toFixed(2)
      if (this.elements.wq) this.elements.wq.textContent = Wq.toFixed(2)
      if (this.elements.ls) this.elements.ls.textContent = Ls.toFixed(2)
      if (this.elements.ws) this.elements.ws.textContent = Ws.toFixed(2)
      if (this.elements.rho) this.elements.rho.textContent = rhoPct.toFixed(2)
      if (this.elements.p0) this.elements.p0.textContent = p0Pct.toFixed(2)

      // Asegurar que el panel final se muestre igual en todos los casos
      // Calcular tiempo real transcurrido
      let realElapsedSec = 0
      if (this.startRealTime) {
        realElapsedSec = (Date.now() - this.startRealTime) / 1000
      }

      if (this.elements.finalResults) {
          this.elements.finalResults.style.display = "block"
          this.elements.finalResults.innerHTML = `<strong>Resultados finales</strong><div>${summary}</div><div>Tiempo simulado: ${this.formatTime(this.currentTime)}</div><div>Tiempo real transcurrido: ${this.formatTime(realElapsedSec)}</div>`
        }
    } catch (err) {
      console.error("Error actualizando panel de métricas:", err)
      if (this.elements.finalResults) {
        this.elements.finalResults.style.display = "block"
        this.elements.finalResults.innerHTML = `<strong>Resultados finales</strong><div>${summary}</div><div>Tiempo simulado: ${this.formatTime(this.currentTime)}</div>`
      }
    }
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins} min - ${secs} s`
  }

  addLog(message, type = "info") {
    const logEntry = document.createElement("div")
    logEntry.className = `log-entry ${type}`
    logEntry.textContent = `[${this.formatTime(this.currentTime)}] ${message}`

    const logBox = this.elements.logBox
    logBox.appendChild(logEntry)
    logBox.scrollTop = logBox.scrollHeight

    while (logBox.children.length > 100) {
      logBox.removeChild(logBox.firstChild)
    }
  }

  initializeEventListeners() {
    // Botones de control
    if (this.elements.startBtn) {
      this.elements.startBtn.addEventListener("click", () => {
        console.log("✓ Botón Iniciar presionado")
        this.start()
      })
    }

    if (this.elements.pauseBtn) {
      this.elements.pauseBtn.addEventListener("click", () => {
        console.log("✓ Botón Pausar presionado")
        this.pause()
      })
    }

    if (this.elements.resetBtn) {
      this.elements.resetBtn.addEventListener("click", () => {
        console.log("✓ Botón Reiniciar presionado")
        this.reset()
      })
    }

    // Control de velocidad (slider)
    if (this.elements.speedControl) {
      this.elements.speedControl.addEventListener("input", (e) => {
        this.speedMultiplier = Number.parseFloat(e.target.value)
        if (this.elements.speedLabel) {
          this.elements.speedLabel.textContent = `${this.speedMultiplier.toFixed(1)}x`
        }
        this.addLog(`Velocidad ajustada a ${this.speedMultiplier}x`, "info")
        console.log("Velocidad:", this.speedMultiplier)
      })
    }

    // Control de velocidad (input numérico personalizado)
    if (this.elements.speedInput) {
      this.elements.speedInput.addEventListener("change", (e) => {
        const value = parseFloat(e.target.value)
        if (value >= 0.5 && value <= 5) {
          this.speedMultiplier = value
          if (this.elements.speedControl) this.elements.speedControl.value = value
          if (this.elements.speedLabel) {
            this.elements.speedLabel.textContent = `${this.speedMultiplier.toFixed(1)}x`
          }
          this.addLog(`Velocidad personalizada: ${this.speedMultiplier}x`, "info")
          console.log("Velocidad personalizada:", this.speedMultiplier)
        } else {
          alert("La velocidad debe estar entre 0.5x y 5x")
          e.target.value = this.speedMultiplier
        }
      })
    }

    // Limpiar log
    if (this.elements.clearLogBtn) {
      this.elements.clearLogBtn.addEventListener("click", () => {
        if (this.elements.logBox) {
          this.elements.logBox.innerHTML = '<div class="log-entry initial">Log limpiado</div>'
        }
      })
    }
  }
}

// Inicializar al cargar
document.addEventListener("DOMContentLoaded", () => {
  console.log("✓ DOM cargado, inicializando QueueSimulation...")
  new QueueSimulation()
})
