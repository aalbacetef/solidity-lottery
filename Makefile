
runner = bun x

test:
	$(runner) hardhat test 

.PHONY: test

compile:
	$(runner) hardhat compile 

.PHONY: compile

check:
	$(runner) hardhat check

.PHONY: check
