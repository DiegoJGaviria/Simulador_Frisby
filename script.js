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
    // Soporte para múltiples servidores
    this.servers = [{ id: 1, busy: false, clientServing: null, serviceEndTime: Infinity, startServiceTime: 0 }]
    this.nextServerId = 2

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
      queueCount: document.getElementById("queueCount"),
      serverBox: document.getElementById("serverBox"),
      clientServing: document.getElementById("clientServing"),
      timeRemaining: document.getElementById("timeRemaining"),
      unservedCount: document.getElementById("unservedCount"),
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

    // Inicializar visualizador si existe el canvas
    try {
      const canvas = document.getElementById('simCanvas')
      if (canvas) {
        this.visualizer = new SimulationVisualizer(canvas, this)
      }
    } catch (err) {
      console.warn('No se pudo iniciar visualizador:', err)
    }
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
    // proteger contra valores extremadamente pequeños/ceros
    return Math.max(0.5, this.generateLognormal(this.arrivalMean, this.arrivalStd))
  }

  generateServiceTime() {
    // proteger contra valores extremadamente pequeños/ceros
    return Math.max(0.5, this.generateLognormal(this.serviceMean, this.serviceStd))
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
    // resetear servidores a 1 servidor por defecto
    this.servers = [{ id: 1, busy: false, clientServing: null, serviceEndTime: Infinity, startServiceTime: 0 }]
    this.nextServerId = 2
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
    if (this.visualizer) this.visualizer.reset()
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
    return `${mins}:${String(secs).padStart(2, "0")} Min`
  }

  formatSecondsMMSS(seconds) {
    const s = Math.max(0, Math.round(seconds))
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins}:${String(secs).padStart(2, "0")} Min`
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
        let nextServiceServerIndex = -1

        // buscar el próximo fin de servicio entre todos los servidores
        let nextServiceEnd = Infinity
        for (let si = 0; si < this.servers.length; si++) {
          const s = this.servers[si]
          if (s.busy && s.serviceEndTime < nextServiceEnd) {
            nextServiceEnd = s.serviceEndTime
            nextServiceServerIndex = si
          }
        }

        if (nextServiceEnd < nextEventTime) {
          nextEventTime = nextServiceEnd
          eventType = "departure"
        }

        // Avanzar tiempo
        this.lastEventTime = this.currentTime
        this.currentTime = nextEventTime

        // Procesar evento
        if (eventType === "arrival") {
          this.processArrival()
        } else {
          this.processDeparture(nextServiceServerIndex)
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

    // buscar servidor libre
    const freeIndex = this.servers.findIndex(s => !s.busy)
    if (freeIndex >= 0) {
      const serviceTime = this.generateServiceTime()
      const server = this.servers[freeIndex]
      server.busy = true
      server.clientServing = clientId
      server.startServiceTime = this.currentTime
      server.serviceEndTime = this.currentTime + serviceTime

      this.addLog(`Cliente #${clientId} inicia servicio en caja ${server.id} (${serviceTime.toFixed(1)}s)`, "start")
      if (this.visualizer) this.visualizer.onServiceStart(clientId, freeIndex)
    } else {
      // Agregar a cola y generar su tiempo de servicio previsto
      const queuedServiceTime = this.generateServiceTime()
      this.queue.push({
        id: clientId,
        arrivalTime: arrivalTime,
        serviceTime: queuedServiceTime,
      })

      if (this.queue.length > this.maxQueueLength) {
        this.maxQueueLength = this.queue.length
      }

      this.addLog(`Cliente #${clientId} entra en cola (len: ${this.queue.length})`, "info")
      // Notificar visualizador (nuevo cliente en cola)
      if (this.visualizer) this.visualizer.onNewClient(clientId)
    }

    this.nextArrivalTime = this.currentTime + this.generateArrivalTime()
    // asegurar que nextArrivalTime avance al menos 1s respecto al tiempo actual
    if (this.nextArrivalTime <= this.currentTime) {
      this.nextArrivalTime = this.currentTime + 1
    }
  }


  processDeparture(serverIndex) {
    const server = this.servers[serverIndex]
    if (!server) return
    const clientId = server.clientServing
    const serviceTime = Math.max(0, server.serviceEndTime - server.startServiceTime)

    // Visual: el cliente que estaba en servicio termina
    if (this.visualizer && clientId != null) this.visualizer.onServiceEnd(clientId, serverIndex)

    this.servedCount++
    this.busyTime += serviceTime

    this.addLog(`Cliente #${clientId} termina servicio en caja ${server.id} t=${this.formatTime(this.currentTime)}`, "departure")

    if (this.queue.length > 0) {
      // Siguiente cliente
      const nextClient = this.queue.shift()
      const waitTime = this.currentTime - nextClient.arrivalTime
      const newServiceTime = nextClient.serviceTime !== undefined ? nextClient.serviceTime : this.generateServiceTime()
      const systemTime = waitTime + newServiceTime

      this.clientsHistory.push({
        id: nextClient.id,
        arrivalTime: nextClient.arrivalTime,
        waitTime: waitTime,
        systemTime: systemTime,
      })

      server.clientServing = nextClient.id
      server.startServiceTime = this.currentTime
      server.serviceEndTime = this.currentTime + newServiceTime

      // Notificar visualizador que este cliente pasa a servicio en esa caja
      if (this.visualizer) this.visualizer.onServiceStart(nextClient.id, serverIndex)

      this.addLog(`Cliente #${nextClient.id} inicia servicio en caja ${server.id} (esperó ${waitTime.toFixed(1)}s)`, "start")
    } else {
      // Servidor ocioso
      server.busy = false
      server.clientServing = null
      server.serviceEndTime = Infinity
      this.addLog(`Caja ${server.id} queda ociosa`, "info")
    }

    this.totalObservedTime = this.currentTime
  }

  // ============ ACTUALIZACIÓN DE UI ============

  updateUI() {
    this.updateServerDisplay()
    this.updateClientInfo()
    this.updateMetrics()
  }

  updateServerDisplay() {
    const serverBox = this.elements.serverBox
    const statusDiv = serverBox.querySelector(".server-status")
    // Mostrar estado agregado de servidores
    const busyCount = this.servers.filter(s => s.busy).length
    // compute queue length and time to clear queue
    const queueLen = this.queue.length
    // sum remaining time for busy servers
    const busyRemaining = this.servers.reduce((sum, s) => sum + (s.busy ? Math.max(0, s.serviceEndTime - this.currentTime) : 0), 0)
    // sum service times in queue (if available)
    const queuedTotal = this.queue.reduce((sum, q) => sum + (q.serviceTime || 0), 0)
    const totalWork = busyRemaining + queuedTotal
    const nServers = Math.max(1, this.servers.length)
    const timeToClear = nServers > 0 ? (totalWork / nServers) : totalWork

    if (busyCount > 0) {
      statusDiv.className = "server-status busy"
      statusDiv.innerHTML = `<div class="status-label">EN ATENCIÓN (${busyCount}/${this.servers.length})</div>`
    } else {
      statusDiv.className = "server-status idle"
      statusDiv.innerHTML = '<div class="status-label">Disponible</div>'
    }

    // Update DOM fields if exist
    if (this.elements.timeRemaining) this.elements.timeRemaining.textContent = (queueLen > 0 ? this.formatSecondsMMSS(timeToClear) : this.formatSecondsMMSS(0))
    if (this.elements.queueCount) this.elements.queueCount.textContent = String(queueLen)
    if (this.elements.clientServing) {
      if (busyCount === 1) {
        const first = this.servers.find(s => s.busy)
        this.elements.clientServing.textContent = first ? `#${first.clientServing}` : "--"
      } else {
        this.elements.clientServing.textContent = `${busyCount}/${this.servers.length}`
      }
    }
  }

  updateClientInfo() {
    if (this.elements.arrivedCount) this.elements.arrivedCount.textContent = this.arrivedCount
    if (this.elements.servedCount) this.elements.servedCount.textContent = this.servedCount
    if (this.elements.unservedCount) this.elements.unservedCount.textContent = String(Math.max(0, this.arrivedCount - this.servedCount))
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

    // contar servidores ocupados
    Ls += this.servers.filter(s => s.busy).length

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
      if (this.elements.unservedCount) this.elements.unservedCount.textContent = String(Math.max(0, totalArrived - totalServed))
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

      Ls += this.servers.filter(s => s.busy).length
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

  // formatTime is defined earlier (mm:ss). This placeholder removed to keep single mm:ss format.

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

    // Agregar caja dinámica
    const addBtn = document.getElementById('addServerBtn')
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.addServer()
      })
    }

    // Eliminar caja dinámica (última caja no ocupada si es posible)
    const removeBtn = document.getElementById('removeServerBtn')
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        this.removeServer()
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

  addServer() {
    const newId = this.nextServerId++
    this.servers.push({ id: newId, busy: false, clientServing: null, serviceEndTime: Infinity, startServiceTime: 0 })
    this.addLog(`Se agregó la caja ${newId}`, 'info')
    if (this.visualizer) {
      // visualizer usa sim.servers para calcular posiciones en resizeCanvas
      this.visualizer.resizeCanvas()
    }
  }

  removeServer() {
    if (this.servers.length <= 1) {
      this.addLog('No se puede eliminar la última caja.', 'info')
      return
    }
    // intentar eliminar la última caja que no esté ocupada
    for (let i = this.servers.length - 1; i >= 0; i--) {
      const s = this.servers[i]
      if (!s.busy) {
        this.servers.splice(i, 1)
        this.addLog(`Se eliminó la caja ${s.id}`, 'info')
        if (this.visualizer) this.visualizer.resizeCanvas()
        return
      }
    }
    // si todas están ocupadas, avisar y no eliminar
    this.addLog('No se pudo eliminar: todas las cajas están ocupadas.', 'info')
  }
}

// Inicializar al cargar
class SimulationVisualizer {
  constructor(canvas, sim) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.sim = sim
    this.clients = new Map() // id -> visual client
    this.queueOrder = []
    this.running = true

    this.devicePixelRatio = window.devicePixelRatio || 1
    // visual layout params
    this.serverBoxWidth = 120
    this.serverBoxHeight = 60
    this.marginRight = 36
    this.marginLeft = 60
    this.serverPositions = []
    this.queueStart = { x: this.marginLeft, y: 110 }
    this.slotSpacing = 34

    this.resizeCanvas()
    window.addEventListener('resize', () => this.resizeCanvas())

    this.lastTs = performance.now()
    requestAnimationFrame(this.loop.bind(this))
  }

  resizeCanvas() {
    const w = this.canvas.clientWidth
    const h = parseInt(this.canvas.getAttribute('height'), 10) || 220
    this.canvas.width = Math.round(w * this.devicePixelRatio)
    this.canvas.height = Math.round(h * this.devicePixelRatio)
    this.canvas.style.height = h + 'px'
    this.ctx = this.canvas.getContext('2d')
    this.ctx.scale(this.devicePixelRatio, this.devicePixelRatio)
    // recalcular posiciones de servidores según cantidad
    const clientW = this.canvas.clientWidth
    const clientH = h
    const n = (this.sim && this.sim.servers) ? this.sim.servers.length : 1
    const vGap = 16
    const totalH = n * this.serverBoxHeight + Math.max(0, n - 1) * vGap
    let startY = Math.max(this.serverBoxHeight / 2 + 12, (clientH - totalH) / 2 + this.serverBoxHeight / 2)
    const x = clientW - this.marginRight - (this.serverBoxWidth / 2)
    this.serverPositions = []
    for (let i = 0; i < n; i++) {
      this.serverPositions.push({ x: x, y: startY + i * (this.serverBoxHeight + vGap) })
    }
    // colocar inicio de la cola más cerca de las cajas (fila visual más próxima)
    const desiredX = Math.max(this.marginLeft, x - 220)
    this.queueStart.x = desiredX
    this.queueStart.y = clientH / 2 + 6
    // ajustar slotSpacing dinámico (menos espacio si la cola está próxima)
    const available = Math.max(60, x - this.queueStart.x - 40)
    const baseSlots = Math.max(6, this.queueOrder.length || 6)
    this.slotSpacing = Math.min(48, Math.max(24, Math.floor(available / baseSlots)))
  }

  reset() {
    this.clients.clear()
    this.queueOrder = []
  }

  onNewClient(id) {
    // Create visual client positioned off-canvas to the left
    const c = {
      id,
      x: this.queueStart.x - 48,
      y: (this.queueStart.y || 110) + (Math.random() - 0.5) * 6,
      r: 10,
      color: '#667eea', // color espera
      state: 'toQueue',
      targetIndex: this.queueOrder.length,
    }
    this.queueOrder.push(id)
    this.clients.set(id, c)
  }

  onServiceStart(id, serverIndex = 0) {
    // move client to the specified server position
    let c = this.clients.get(id)
    if (!c) {
      c = { id, x: this.queueStart.x - 48, y: this.queueStart.y, r: 10, color: '#28a745', state: 'toServer' }
      this.clients.set(id, c)
    }
    c.state = 'toServer'
    c.color = '#28a745'
    const sp = (this.serverPositions && this.serverPositions[serverIndex]) ? this.serverPositions[serverIndex] : this.serverPositions[0]
    if (sp) {
      c.targetX = sp.x
      c.targetY = sp.y
    }
    // remove from queueOrder if present
    const idx = this.queueOrder.indexOf(id)
    if (idx >= 0) this.queueOrder.splice(idx, 1)
    this.reindexQueueTargets()
  }

  onServiceEnd(id, serverIndex) {
    const c = this.clients.get(id)
    if (c) {
      c.state = 'exit'
      // start exit from server position if available
      const sp = (this.serverPositions && this.serverPositions[serverIndex]) ? this.serverPositions[serverIndex] : null
      if (sp) {
        c.x = sp.x
        c.y = sp.y
      }
      c.targetX = this.canvas.clientWidth + 40
      c.targetY = c.y
      c.color = '#6c757d'
    }
  }

  reindexQueueTargets() {
    for (let i = 0; i < this.queueOrder.length; i++) {
      const id = this.queueOrder[i]
      const c = this.clients.get(id)
      if (c) {
        c.targetX = this.queueStart.x + i * this.slotSpacing
        c.targetY = this.queueStart.y - 20
        c.state = 'toQueue'
        c.targetIndex = i
      }
    }
  }

  loop(ts) {
    const dt = Math.min(0.1, (ts - this.lastTs) / 1000)
    this.lastTs = ts
    this.update(dt)
    this.draw()
    requestAnimationFrame(this.loop.bind(this))
  }

  update(dt) {
    const speedBase = 120 // px/s
    const speed = speedBase * (this.sim?.speedMultiplier || 1)
    for (const [id, c] of this.clients.entries()) {
      const tx = (c.targetX !== undefined) ? c.targetX : (c.x)
      const ty = (c.targetY !== undefined) ? c.targetY : (c.y)
      const dx = tx - c.x
      const dy = ty - c.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 1) {
        const vx = (dx / dist) * speed * dt
        const vy = (dy / dist) * speed * dt
        c.x += Math.abs(vx) > Math.abs(dx) ? dx : vx
        c.y += Math.abs(vy) > Math.abs(dy) ? dy : vy
      } else {
        // when reached exit remove if state == exit
        if (c.state === 'exit') {
          this.clients.delete(id)
        }
      }
    }
  }

  draw() {
    const ctx = this.ctx
    const w = this.canvas.clientWidth
    const h = parseInt(this.canvas.getAttribute('height'), 10) || 220
    // clear
    ctx.clearRect(0, 0, w, h)

    // helper: rounded rect
    const roundRect = (x, y, width, height, radius) => {
      ctx.beginPath()
      ctx.moveTo(x + radius, y)
      ctx.arcTo(x + width, y, x + width, y + height, radius)
      ctx.arcTo(x + width, y + height, x, y + height, radius)
      ctx.arcTo(x, y + height, x, y, radius)
      ctx.arcTo(x, y, x + width, y, radius)
      ctx.closePath()
    }

    // draw server boxes
    for (let i = 0; i < (this.serverPositions ? this.serverPositions.length : 1); i++) {
      const sp = this.serverPositions[i]
      const sx = sp.x - (this.serverBoxWidth / 2)
      const sy = sp.y - (this.serverBoxHeight / 2)
      ctx.save()
      ctx.shadowColor = 'rgba(35,47,62,0.10)'
      ctx.shadowBlur = 12
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'
      ctx.lineWidth = 1
      roundRect(sx, sy, this.serverBoxWidth, this.serverBoxHeight, 8)
      ctx.fill()
      ctx.stroke()
      ctx.restore()

      // label and status
      const srv = (this.sim && this.sim.servers && this.sim.servers[i]) ? this.sim.servers[i] : null
      const busy = srv ? srv.busy : false
      ctx.fillStyle = busy ? '#fff3f3' : '#eefaf0'
      roundRect(sx + 8, sy + 10, this.serverBoxWidth - 16, 24, 6)
      ctx.fill()
      ctx.fillStyle = '#333'
      ctx.font = '12px "Segoe UI", Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const label = srv ? `Caja ${srv.id}` : 'Caja'
      ctx.fillText(label, sx + this.serverBoxWidth / 2, sy + 22)

      // status dot
      ctx.beginPath()
      ctx.fillStyle = busy ? '#dc3545' : '#28a745'
      ctx.arc(sx + 18, sy + 20, 5, 0, Math.PI * 2)
      ctx.fill()
    }

    // queue visual slots removed (campo de espera eliminado)

    // draw clients as user-icon (head + body), no numbers
    for (const [id, c] of this.clients.entries()) {
      ctx.save()
      ctx.beginPath()
      ctx.shadowColor = 'rgba(20,30,60,0.12)'
      ctx.shadowBlur = 8
      // head
      ctx.fillStyle = c.color || '#667eea'
      ctx.beginPath()
      ctx.arc(c.x, c.y - 1, 6, 0, Math.PI * 5)
      ctx.fill()
      // body (rounded rectangle / semicircle)
      ctx.beginPath()
      ctx.fillStyle = c.color || '#667eea'
      ctx.moveTo(c.x - 10, c.y + 6)
      ctx.quadraticCurveTo(c.x, c.y + 18, c.x + 10, c.y + 6)
      ctx.closePath()
      ctx.fill()
      // white stroke for separation
      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'
      ctx.stroke()
      ctx.restore()
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("✓ DOM cargado, inicializando QueueSimulation...")
  new QueueSimulation()
})
