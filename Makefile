name = pong_cli

.DEFAULT_GOAL = all

all: up

up:
	@docker build -t pong-cli .
	@docker run --rm -it --network host pong-cli

status : 
	@docker ps
	
clean:
	@docker rmi pong-cli

.PHONY : all up clean status