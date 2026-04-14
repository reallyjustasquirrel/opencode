import { test, expect } from "bun:test"
import { DangerousCommands } from "../../src/permission/dangerous-commands"

// destructive removal

test("check - rm -rf / is dangerous", () => {
  expect(DangerousCommands.check("rm -rf /")).toBeTruthy()
})

test("check - rm -rf ~ is dangerous", () => {
  expect(DangerousCommands.check("rm -rf ~/")).toBeTruthy()
})

test("check - rm -rf $HOME is dangerous", () => {
  expect(DangerousCommands.check("rm -rf $HOME/")).toBeTruthy()
})

test("check - rm -r / is dangerous", () => {
  expect(DangerousCommands.check("rm -r /")).toBeTruthy()
})

// disk destruction

test("check - mkfs is dangerous", () => {
  expect(DangerousCommands.check("mkfs.ext4 /dev/sda1")).toBeTruthy()
})

test("check - dd to disk is dangerous", () => {
  expect(DangerousCommands.check("dd if=/dev/zero of=/dev/sda")).toBeTruthy()
})

// chmod -R on root

test("check - chmod -R 000 / is dangerous", () => {
  expect(DangerousCommands.check("chmod -R 000 /")).toBeTruthy()
})

// system file overwrite

test("check - overwrite /etc/passwd is dangerous", () => {
  expect(DangerousCommands.check("> /etc/passwd")).toBeTruthy()
})

test("check - overwrite /etc/shadow is dangerous", () => {
  expect(DangerousCommands.check("> /etc/shadow")).toBeTruthy()
})

// safe commands

test("check - rm file.txt is safe", () => {
  expect(DangerousCommands.check("rm file.txt")).toBeNull()
})

test("check - ls is safe", () => {
  expect(DangerousCommands.check("ls -la")).toBeNull()
})

test("check - git commit is safe", () => {
  expect(DangerousCommands.check("git commit -m 'test'")).toBeNull()
})

test("check - rm -rf ./build is safe", () => {
  expect(DangerousCommands.check("rm -rf ./build")).toBeNull()
})

test("check - dd to file is safe", () => {
  expect(DangerousCommands.check("dd if=/dev/zero of=test.img bs=1M count=100")).toBeNull()
})
