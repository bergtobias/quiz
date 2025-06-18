"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Crown, Zap, RotateCcw, Copy, Check } from "lucide-react"
import { io, type Socket } from "socket.io-client"

interface Player {
  id: string
  name: string
  team: number
  isHost: boolean
}

interface BuzzerEvent {
  playerId: string
  playerName: string
  team: number
  timestamp: number
}

interface RoomState {
  code: string
  players: Player[]
  teamCount: number
  buzzerPressed: boolean
  firstBuzzer: BuzzerEvent | null
  buzzerOrder: BuzzerEvent[]
}

export default function RoomPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const roomCode = params.code as string
  const playerName = searchParams.get("name") || ""
  const isHost = searchParams.get("host") === "true"

  const [socket, setSocket] = useState<Socket | null>(null)
  const [roomState, setRoomState] = useState<RoomState | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [copied, setCopied] = useState(false)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const newSocket = io()

    newSocket.on("connect", () => {
      setConnected(true)
      newSocket.emit("join-room", { roomCode, playerName, isHost })
    })

    newSocket.on("room-state", (state: RoomState) => {
      setRoomState(state)
    })

    newSocket.on("player-joined", (player: Player) => {
      if (player.name === playerName) {
        setCurrentPlayer(player)
      }
    })

    newSocket.on("buzzer-pressed", (data: BuzzerEvent) => {
      console.log(data)
    })

    newSocket.on("disconnect", () => {
      setConnected(false)
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [roomCode, playerName, isHost])

  const pressBuzzer = () => {
    if (socket && currentPlayer && !roomState?.buzzerPressed) {
      socket.emit("press-buzzer", { roomCode, playerId: currentPlayer.id })
    }
  }

  const resetBuzzer = () => {
    if (socket && currentPlayer?.isHost) {
      socket.emit("reset-buzzer", { roomCode })
    }
  }

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy room code:", err)
    }
  }

  const getTeamPlayers = (teamNumber: number) => {
    return roomState?.players.filter((p) => p.team === teamNumber) || []
  }

  const getTeamColor = (teamNumber: number) => {
    const colors = [
      "bg-red-500",
      "bg-blue-500",
      "bg-green-500",
      "bg-yellow-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-indigo-500",
      "bg-orange-500",
    ]
    return colors[teamNumber - 1] || "bg-gray-500"
  }

  if (!connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p>Connecting to room...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!roomState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card>
          <CardContent className="p-8 text-center">
            <p>Room not found</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-md mx-auto">
        {/* Room Header */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Room {roomCode}</CardTitle>
              <Button variant="ghost" size="sm" onClick={copyRoomCode} className="h-8 w-8 p-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Users className="h-4 w-4" />
              <span>{roomState.players.length} players</span>
              <span>•</span>
              <span>{roomState.teamCount} teams</span>
            </div>
          </CardContent>
        </Card>

        {/* Buzzer Status */}
        {roomState.buzzerPressed && roomState.firstBuzzer && (
          <Card className="mb-4 border-yellow-200 bg-yellow-50">
            <CardContent className="p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-800 mb-1">{roomState.firstBuzzer.playerName}</div>
                <div className="text-sm text-yellow-600">Team {roomState.firstBuzzer.team} buzzed first!</div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Buzzer Button */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <Button
              onClick={pressBuzzer}
              disabled={roomState.buzzerPressed}
              className={`w-full h-32 text-2xl font-bold ${
                roomState.buzzerPressed
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-red-500 hover:bg-red-600 active:bg-red-700"
              }`}
              size="lg"
            >
              <Zap className="h-8 w-8 mr-3" />
              {roomState.buzzerPressed ? "BUZZED!" : "BUZZ!"}
            </Button>
          </CardContent>
        </Card>

        {/* Host Controls */}
        {currentPlayer?.isHost && (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Crown className="h-5 w-5" />
                Host Controls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                onClick={resetBuzzer}
                variant="outline"
                className="w-full h-12"
                disabled={!roomState.buzzerPressed}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Buzzer
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Teams */}
        <div className="space-y-4">
          {Array.from({ length: roomState.teamCount }, (_, i) => i + 1).map((teamNumber) => {
            const teamPlayers = getTeamPlayers(teamNumber)
            return (
              <Card key={teamNumber}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full ${getTeamColor(teamNumber)}`}></div>
                    Team {teamNumber}
                    <Badge variant="secondary">{teamPlayers.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {teamPlayers.length > 0 ? (
                    <div className="space-y-2">
                      {teamPlayers.map((player) => (
                        <div key={player.id} className="flex items-center gap-2">
                          <span className="text-sm">{player.name}</span>
                          {player.isHost && <Crown className="h-3 w-3 text-yellow-500" />}
                          {currentPlayer?.id === player.id && (
                            <Badge variant="outline" className="text-xs">
                              You
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No players yet</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Buzzer Order */}
        {roomState.buzzerOrder.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-lg">Buzzer Order</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {roomState.buzzerOrder.map((buzz, index) => (
                  <div key={buzz.playerId} className="flex items-center gap-3">
                    <Badge variant={index === 0 ? "default" : "secondary"}>{index + 1}</Badge>
                    <span className="text-sm">{buzz.playerName}</span>
                    <span className="text-xs text-gray-500">Team {buzz.team}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
