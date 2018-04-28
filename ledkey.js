const Gpio = require('onoff').Gpio;

var digits = [
    0b00111111, // 0
    0b00000110, // 1
    0b01011011, // 2
    0b01001111, // 3
    0b01100110, // 4
    0b01101101, // 5
    0b01111101, // 6
    0b00000111, // 7
    0b01111111, // 8
    0b01100111, // 9
    0b00000000  //
];

var last = 0;

class ledkey {
  constructor(stb, clk, dio, cb) {
    this.stb = new Gpio(stb, 'out');
    this.clk = new Gpio(clk, 'out');
    this.dio = new Gpio(dio, 'out');
    this.stb.writeSync(0);
    this.clk.writeSync(0);
    this.dio.writeSync(0);
    this.cb = cb;
    this.leds = new Array(8).fill(0);
    this.disps = new Array(8).fill(0);
    this.sendCommand(0x80);
    this.reset();
    this.timer = setInterval(() => {
      var but = this.getButtons();
      if (last != but) {
        var mask = last ^ but;
        cb(mask, mask & but);
        last = but;
      };
    }, 100);
  }

  reset() {
    this.sendCommand(0x40);
    this.stb.writeSync(0);
    this.shiftOut(0xC0);
    for (var n=0; n<16; n++) {
      this.shiftOut(0x00);
    }
    this.stb.writeSync(1);
  }

  setup(enable, brightness) {
    this.sendCommand((enable ? 0x88 : 0x80) + brightness)
  }

  sendCommand(cmd) {
    this.stb.writeSync(0);
    this.shiftOut(cmd);
    this.stb.writeSync(1);
  }

  shiftOut(value) {
    for (var i=0; i<8; i++) {
      this.dio.writeSync((value & (1<<i)) ? 1 : 0);
      this.clk.writeSync(1);
      this.clk.writeSync(0);
    }
  }

  setDisp() {
    this.dio.setDirection('out');
    this.sendCommand(0x40);
    this.stb.writeSync(0);
    this.shiftOut(0xC0);
    for (var i=0; i<8; i++) {
      this.shiftOut(digits[this.disps[i]]);
      this.shiftOut(this.leds[i]);
    }
    this.stb.writeSync(1);
  }

  setLED(led, state) {
    this.leds[led] = state;
    this.dio.setDirection('out');
    this.sendCommand(0x44);
    this.stb.writeSync(0);
    this.shiftOut(0xC1 + (led << 1));
    this.shiftOut(state);
    this.stb.writeSync(1);
  }

  setNum(num) {
    for (var i=0; i<8; i++) {
      this.disps[7-i] = num ? num % 10 : 10;
      num = ~~(num / 10);
    }
    this.setDisp();
  }

  shiftIn() {
    var v = 0;
    for (var i=0; i<8; i++) {
      this.clk.writeSync(1);
      v = (v << 1) | this.dio.readSync();
      this.clk.writeSync(0);
    }
    return v;
  }

  getButtons() {
    var buttons = 0;
    this.stb.writeSync(0);
    this.shiftOut(0x42);
    this.dio.setDirection('in');
    for (var i=0; i<4; i++) {
      buttons |= (this.shiftIn() & 0x88) >> i;
    }
    this.dio.setDirection('out');
    this.stb.writeSync(1);
    return buttons;
  }

  close() {
    clearInterval(this.timer);
    this.stb.unexport();
    this.clk.unexport();
    this.dio.unexport();
  }
};

module.exports = function(RED) {
  function LedKeyNode(config) {
    RED.nodes.createNode(this,config);
    var node = this;

    function cb(mask, state) {
      for (var s=8, b=1; s; s--, b<<=1) {
        if (b & mask) {
          var msg = {
            topic: `S${s}`,
            payload: b & state ? 1 : 0
          };
          node.send(msg);
        }
      }
    }

    const lk = new ledkey(13, 12, 6, cb);
    lk.setup(1, 0);

    node.on('input', function(msg) {
      if (msg.topic === 'num') {
        lk.setNum(msg.payload);
      }
      if (msg.topic.substring(0,3) === 'LED') {
        lk.setLED(Number(msg.topic[3])-1, msg.payload);
      }
    });

    node.on("close", function () {
      lk.close();
    });
  }
  RED.nodes.registerType("ledkey", LedKeyNode);
}
