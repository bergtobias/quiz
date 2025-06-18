"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Users, Plus, LogIn } from "lucide-react";
import { io } from "socket.io-client";

export default function HomePage() {
  const [roomCode, setRoomCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [teamCount, setTeamCount] = useState(2);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const createRoom = async () => {
    if (!playerName.trim()) return;

    setIsCreating(true);
    try {
      const socket = io();

      socket.emit(
        "create-room",
        { teamCount, hostName: playerName },
        (response: { success: string; error: string; roomCode: string }) => {
          if (response.success) {
            router.push(
              `/room/${response.roomCode}?name=${encodeURIComponent(
                playerName
              )}&host=true`
            );
          } else {
            console.error("Failed to create room:", response.error);
          }
          setIsCreating(false);
          socket.disconnect();
        }
      );
    } catch (error) {
      console.error("Failed to create room:", error);
      setIsCreating(false);
    }
  };

  const joinRoom = () => {
    if (!roomCode.trim() || !playerName.trim()) return;
    router.push(
      `/room/${roomCode.toUpperCase()}?name=${encodeURIComponent(playerName)}`
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-md mx-auto pt-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Quiz Buzzer</h1>
          <p className="text-gray-600">Create or join a quiz room</p>
        </div>

        <div className="space-y-6">
          {/* Player Name Input */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Name</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="text-lg h-12"
              />
            </CardContent>
          </Card>

          {/* Create Room */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Create Room
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="teams">Number of Teams</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTeamCount(Math.max(2, teamCount - 1))}
                    disabled={teamCount <= 2}
                  >
                    -
                  </Button>
                  <span className="text-xl font-semibold w-12 text-center">
                    {teamCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTeamCount(Math.min(8, teamCount + 1))}
                    disabled={teamCount >= 8}
                  >
                    +
                  </Button>
                </div>
              </div>
              <Button
                onClick={createRoom}
                disabled={!playerName.trim() || isCreating}
                className="w-full h-12 text-lg"
                size="lg"
              >
                <Users className="h-5 w-5 mr-2" />
                {isCreating ? "Creating..." : "Create Room"}
              </Button>
            </CardContent>
          </Card>

          {/* Join Room */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogIn className="h-5 w-5" />
                Join Room
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Enter room code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="text-lg h-12 text-center font-mono"
                maxLength={6}
              />
              <Button
                onClick={joinRoom}
                disabled={!roomCode.trim() || !playerName.trim()}
                className="w-full h-12 text-lg"
                size="lg"
                variant="outline"
              >
                <LogIn className="h-5 w-5 mr-2" />
                Join Room
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
