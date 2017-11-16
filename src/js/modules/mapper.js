import { posts } from '../../data/posts';


const mapper = function(arr, prop) {
  return arr.map(function(obj) {
    return obj[prop];
  })
};


var value = mapper(posts, 'content');
const mess = document.querySelector('.message');
mess.innerHTML = value[2].rendered

const nodes = {
  attrs: {
    class: {
      show: 'show',
      hide: 'hide'
    },
    id:'main',
    src: '',
    url: 'http://www.justynclark.com/'
  },
  div: document.createElement('div'),
  p: document.createElement('p'),
  span: document.createElement('span'),
  build: function(r) {
    this.div.setAttribute('class', this.attrs.class.show);
    this.div.setAttribute('src', this.attrs.url);
    this.div.setAttribute('id', this.attrs.id);
    this.p.innerHTML = r;
    this.div.appendChild(this.p);
    var body = document.querySelector('body');
    body.appendChild(this.div);
  }
}

console.log(
  nodes,
  nodes.build(value[0].rendered)
);


