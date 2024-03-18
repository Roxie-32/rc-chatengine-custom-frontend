import { useState, useEffect, useCallback } from 'react';
import useWebSocket from 'react-use-websocket';

const App = () => {
	// State for login form
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');

	// State for auth token
	const [authToken, setAuthToken] = useState(localStorage.getItem('authToken'));

	// State for chat
	const [rooms, setRooms] = useState([]);
	const [messages, setMessages] = useState({}); // Messages stored by roomId
	const [selectedRoom, setSelectedRoom] = useState(null);
	const [messageInput, setMessageInput] = useState('');

	// Websocket URL
	const WS_URL = process.env.REACT_APP_WS_URL;

	//Admin Credentials
	const ADMIN_ACCESS_TOKEN = process.env.REACT_APP_ADMIN_ACCESS_TOKEN;
	const ADMIN_USER_ID = process.env.REACT_APP_ADMIN_USER_ID;

	// Login user
	const loginUser = async (e) => {
		e.preventDefault();

		//Send a request to Rocket.Chat login endpoint
		if (username && password) {
			const response = await fetch(`${process.env.REACT_APP_REST_URL}/login`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ user: username, password }),
			});

			const data = await response.json();
			const user_Id = data.data.userId;


			// Create authentication token for the user on Rocket.Chat
			const tokenResponse = await fetch(`${process.env.REACT_APP_REST_URL}/users.createToken`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-User-Id': ADMIN_USER_ID,
					'X-Auth-Token': ADMIN_ACCESS_TOKEN,
				},
				body: JSON.stringify({ userId: user_Id }),

			});


			const tokenData = await tokenResponse.json();
			const authToken = tokenData.data.authToken;
			setAuthToken(authToken);
			localStorage.setItem('authToken', authToken);
			window.location.reload();
		}
		setPassword('');
		setUsername('');
	};

	// Websocket connection
	const { sendMessage } = useWebSocket(WS_URL, {
		onOpen: () => {
			console.log('WebSocket Connected');

			// 1- connect
			sendMessage(
				JSON.stringify({
					msg: 'connect',
					version: '1',
					support: ['1', 'pre2', 'pre1'],
				})
			);

			// 2- login
			sendMessage(
				JSON.stringify({
					msg: 'method',
					method: 'login',
					id: '42',
					params: [{ resume: authToken }],
				})
			);

			// 3- get rooms
			sendMessage(
				JSON.stringify({
					msg: 'method',
					method: 'rooms/get',
					id: '43',
					params: [{ $date: 0 }],
				})
			);
		},
		onMessage: (event) => {
			const data = JSON.parse(event.data);

			// pong the Server
			if (data.msg === 'ping') {
				sendMessage(JSON.stringify({ msg: 'pong' }));
			}

			if (data.msg === 'result' && data.id === '43') {
				// Handle rooms/get result
				setRooms(data.result.update);
				localStorage.setItem('rooms', JSON.stringify(data.result.update));
			}

			if (data.msg === 'updated' && data.methods[0].startsWith('room_')) {
				const roomId = data.methods[0].substring(5);
				/* load room  history*/
				const historyRequest = {
					msg: 'method',
					method: 'loadHistory',
					id: 'messages_' + roomId,
					params: [roomId, null, 10, { $date: 0 }],
				};

				sendMessage(JSON.stringify(historyRequest));
			}

			// Stream new incoming  messages
			if (data.msg === 'result' && data.id.startsWith('messages_')) {
				const roomId = data.id.substring(9);
				const messages = data.result.messages;
				setMessages(() => ({
					[roomId]: messages,
				}));

				const subscribeRequest = {
					msg: 'sub',
					id: roomId,
					name: 'stream-room-messages',
					params: [roomId, { useCollection: false, args: [] }],
				};

				sendMessage(JSON.stringify(subscribeRequest));
			}

			if (
				data.msg === 'changed' && data.collection === 'stream-room-messages'
			) {
				const roomId = data.fields.eventName;
				const message = data.fields.args[0];
				setMessages((prev) => ({
					...prev,
					[roomId]: [...prev[roomId], message],
				}));
			}
			return false;
		},
	});

	// Send chat message
	const sendChatMessage = (e, roomId) => {
		e.preventDefault();
		if (messageInput && roomId) {
			sendMessage(
				JSON.stringify({
					msg: 'method',
					method: 'sendMessage',
					id: '423',
					params: [
						{
							rid: roomId,
							msg: messageInput,
						},
					],
				})
			);
			setMessageInput('');
		}
	};

	// Load rooms from local storage
	useEffect(() => {
		localStorage.clear();
		const localRooms = localStorage.getItem('rooms');
		if (localRooms) {
			setRooms(JSON.parse(localRooms));
		}
	}, []);

	// Handle channel click
	const handleChannelClick = useCallback(
		(roomId) => {
			setSelectedRoom(roomId);
			// Open room
			sendMessage(
				JSON.stringify({
					msg: 'method',
					method: 'openRoom',
					id: `room_${roomId}`,
					params: [roomId],
				})
			);

			// Load history for the room
			sendMessage(
				JSON.stringify({
					msg: 'method',
					method: 'loadHistory',
					id: `messages_${roomId}`,
					params: [roomId, null, 10, { $date: 0 }],
				})
			);
		},
		[sendMessage]
	);

	// Format ISO date
	const formatIsoDate = (isoDate) => {
		const date = new Date(isoDate);
		// format for chat time, remove seconds
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: 'numeric',
		});
	};



	return (
		<div className="container">
			<div className="title-section">
				<h1>Chat Engine with Custom Front end </h1>
				<p>Example App Using React.</p>
			</div>
			{!authToken ? (
				<form onSubmit={loginUser} className="login-form">
					<input
						type="text"
						placeholder="Username"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
					/>
					<input
						type="password"
						placeholder="Password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
					<button type="submit">Login</button>
				</form>
			) : (
				<div className="flex-chat-section">
					<div className="rooms">
						<h2>Rooms</h2>
						<hr />
						<ul>
							{rooms.map((room) => (
								<li
									key={room._id}
									onClick={() => handleChannelClick(room._id)}
									className={selectedRoom === room._id ? 'selected' : ''}
								>
									{room.name}
								</li>
							))}
						</ul>
					</div>
					<div className="messages">
						{Object.entries(messages).map(([roomId, roomMessages]) => (
							<div className="messages-col">
								<ul key={roomId} className="messages-container">
									{roomMessages.map((msg, index) => (
										<li key={index} className="box">
											<div className="message">
												<p className="user">
													{msg.u.name} - {formatIsoDate(msg.ts.$date)}
												</p>
												<p className="text">{msg.msg}</p>
											</div>
										</li>
									))}
								</ul>
								<div className="form">
									<textarea
										placeholder="Type your message here..."
										rows="2"
										value={messageInput}
										onChange={(e) => setMessageInput(e.target.value)}
									></textarea>
									<button
										onClick={(e) => sendChatMessage(e, roomId)}
										className="send-button"
									>
										Send
									</button>
								</div>
							</div>
						))}
						{!selectedRoom && (
							<p className="load-message-alert">
								Select a room to start chatting!
							</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default App;
